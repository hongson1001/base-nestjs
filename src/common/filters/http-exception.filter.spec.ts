import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { ErrorCode } from '../constants/error-codes.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: any;

  beforeEach(() => {
    // Silence Logger.error output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({
          status: mockStatus,
        }),
      }),
    };
  });

  it('should format HttpException with code and message', () => {
    const exception = new HttpException(
      { code: 'CUSTOM_ERROR', message: 'Something went wrong' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      data: null,
      errors: [
        {
          code: 'CUSTOM_ERROR',
          message: 'Something went wrong',
          field: null,
        },
      ],
    });
  });

  it('should format validation errors (array of messages)', () => {
    const exception = new BadRequestException({
      message: ['name must not be empty', 'email must be valid'],
    });

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      data: null,
      errors: [
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'name must not be empty',
          field: null,
        },
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'email must be valid',
          field: null,
        },
      ],
    });
  });

  it('should format class-validator ValidationError objects', () => {
    const exception = new BadRequestException({
      message: [
        {
          property: 'email',
          constraints: {
            isEmail: 'email must be a valid email',
          },
        },
      ],
    });

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      data: null,
      errors: [
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'email must be a valid email',
          field: 'email',
        },
      ],
    });
  });

  it('should format unknown exceptions with INTERNAL_ERROR', () => {
    const exception = new Error('unexpected crash');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      data: null,
      errors: [
        {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
          field: null,
        },
      ],
    });
  });

  it('should map 401 to UNAUTHORIZED', () => {
    const exception = new UnauthorizedException('Not logged in');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    const errors = mockJson.mock.calls[0][0].errors;
    expect(errors[0].code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should map 403 to FORBIDDEN', () => {
    const exception = new ForbiddenException('Access denied');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    const errors = mockJson.mock.calls[0][0].errors;
    expect(errors[0].code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should map 404 to RESOURCE_NOT_FOUND', () => {
    const exception = new NotFoundException('Item not found');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const errors = mockJson.mock.calls[0][0].errors;
    expect(errors[0].code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });
});
