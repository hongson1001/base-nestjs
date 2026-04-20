import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { NotificationGateway } from '../gateways/notification.gateway.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

interface ResponseData {
  _id?: string;
  id?: string;
}

@Injectable()
export class RealtimeInterceptor implements NestInterceptor {
  constructor(private readonly notificationGateway: NotificationGateway) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method: string = request.method?.toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseData: unknown) => {
        try {
          const entity = this.extractEntity(request.originalUrl ?? request.url);
          const action = METHOD_ACTION_MAP[method] ?? 'update';
          const data = responseData as ResponseData | null | undefined;
          const id =
            (request.params as Record<string, string>)?.id ??
            data?._id ??
            data?.id ??
            null;

          this.notificationGateway.pushEntityChange({
            entity,
            action,
            id: id?.toString() ?? null,
            timestamp: new Date().toISOString(),
          });
        } catch {
          /* swallow extraction errors */
        }
      }),
    );
  }

  private extractEntity(url: string): string {
    // Extract entity from URL path, e.g. /api/v1/products/123 → products
    const segments = url
      .split('?')[0]
      .split('/')
      .filter((s) => s.length > 0);

    // Walk backwards to find the first non-ID-like segment
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      // Skip segments that look like IDs (ObjectId hex or numeric)
      if (/^[0-9a-f]{24}$/i.test(segment) || /^\d+$/.test(segment)) continue;
      // Skip version prefix like v1, v2
      if (/^v\d+$/i.test(segment)) continue;
      // Skip common prefixes
      if (segment === 'api') continue;
      return segment;
    }

    return 'unknown';
  }
}
