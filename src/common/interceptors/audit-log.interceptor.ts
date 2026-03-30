import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema.js';
import type { Principal } from '../interfaces/principal.interface.js';

interface AuditRequest extends Request {
  principal?: Principal;
}

const AUDITABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const method: string = request.method?.toUpperCase();

    if (!AUDITABLE_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const principal = request.principal;
        const log = {
          userId: principal?.userId ?? null,
          action: method,
          resource: request.originalUrl ?? request.url,
          resourceId: (request.params as Record<string, string>)?.id ?? null,
          changes: null,
          ip: request.ip ?? request.socket?.remoteAddress,
          userAgent: request.headers?.['user-agent'] ?? null,
          timestamp: new Date(),
        };

        // Fire-and-forget
        this.auditLogModel.create(log).catch(() => {
          /* swallow audit write errors */
        });
      }),
    );
  }
}
