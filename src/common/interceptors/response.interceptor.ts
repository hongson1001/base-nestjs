import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta: Record<string, unknown> | null;
  errors: unknown[] | null;
}

interface PaginatedData {
  items: unknown;
  meta: Record<string, unknown>;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((responseData: unknown) => {
        if (this.isPaginated(responseData)) {
          return {
            success: true,
            data: responseData.items as T | null,
            meta: responseData.meta,
            errors: null,
          };
        }

        return {
          success: true,
          data: (responseData ?? null) as T | null,
          meta: null,
          errors: null,
        };
      }),
    );
  }

  private isPaginated(data: unknown): data is PaginatedData {
    return (
      data !== null &&
      typeof data === 'object' &&
      'items' in data &&
      'meta' in data
    );
  }
}
