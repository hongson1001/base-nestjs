import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from '../constants/error-codes.js';

interface ErrorDetail {
  code: string;
  message: string;
  field: string | null;
}

interface ValidationErrorObject {
  property?: string;
  constraints?: Record<string, string>;
}

interface ExceptionResponseObject {
  message?: unknown;
  code?: string;
  field?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let errors: ErrorDetail[];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as ExceptionResponseObject;

        // Handle class-validator ValidationPipe errors
        if (Array.isArray(resp.message)) {
          errors = (resp.message as unknown[]).map((msg: unknown) => {
            if (typeof msg === 'string') {
              return {
                code: ErrorCode.VALIDATION_ERROR,
                message: msg,
                field: null,
              };
            }
            // class-validator ValidationError objects
            const validationErr = msg as ValidationErrorObject;
            if (validationErr.property && validationErr.constraints) {
              const constraintMessages = Object.values(
                validationErr.constraints,
              );
              return {
                code: ErrorCode.VALIDATION_ERROR,
                message: constraintMessages.join(', '),
                field: validationErr.property,
              };
            }
            return {
              code: ErrorCode.VALIDATION_ERROR,
              message: String(msg),
              field: null,
            };
          });
        } else {
          errors = [
            {
              code: resp.code ?? this.mapStatusToErrorCode(status),
              message:
                typeof resp.message === 'string'
                  ? resp.message
                  : exception.message,
              field: resp.field ?? null,
            },
          ];
        }
      } else {
        errors = [
          {
            code: this.mapStatusToErrorCode(status),
            message: String(exceptionResponse),
            field: null,
          },
        ];
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR as number;
      this.logger.error('Unhandled exception', exception);

      errors = [
        {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
          field: null,
        },
      ];
    }

    response.status(status).json({
      success: false,
      data: null,
      errors,
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED as number:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN as number:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND as number:
        return ErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT as number:
        return ErrorCode.RESOURCE_CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS as number:
        return ErrorCode.TOO_MANY_REQUESTS;
      case HttpStatus.BAD_REQUEST as number:
        return ErrorCode.VALIDATION_ERROR;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
