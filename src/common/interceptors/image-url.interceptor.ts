import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { FileStorageService } from '../services/file-storage.service.js';

const IMAGE_FIELDS = new Set([
  'image',
  'images',
  'thumbnail',
  'avatar',
  'logo',
  'video',
  'videos',
  'coverImage',
]);

interface PaginatedResponse {
  items: unknown[];
  [key: string]: unknown;
}

interface MongooseDocument {
  toObject(): Record<string, unknown>;
}

@Injectable()
export class ImageUrlInterceptor implements NestInterceptor {
  constructor(private readonly fileStorageService: FileStorageService) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(switchMap((data: unknown) => from(this.transformData(data))));
  }

  private async transformData(data: unknown): Promise<unknown> {
    if (data == null) return data;

    // Handle paginated response
    if (
      data &&
      typeof data === 'object' &&
      'items' in data &&
      Array.isArray((data as PaginatedResponse).items)
    ) {
      const paginatedData = data as PaginatedResponse;
      const transformedItems = await Promise.all(
        paginatedData.items.map((item: unknown) => this.transformObject(item)),
      );
      return { ...paginatedData, items: transformedItems };
    }

    // Handle array
    if (Array.isArray(data)) {
      return Promise.all(
        data.map((item: unknown) => this.transformObject(item)),
      );
    }

    // Handle single object
    if (typeof data === 'object') {
      return this.transformObject(data);
    }

    return data;
  }

  private async transformObject(
    obj: unknown,
  ): Promise<Record<string, unknown> | null | undefined> {
    if (obj == null || typeof obj !== 'object') return obj as null | undefined;

    // Convert Mongoose document to plain object if needed
    const mongooseDoc = obj as Partial<MongooseDocument>;
    const plain: Record<string, unknown> =
      typeof mongooseDoc.toObject === 'function'
        ? mongooseDoc.toObject()
        : { ...(obj as Record<string, unknown>) };
    const signPromises: Promise<void>[] = [];

    for (const key of Object.keys(plain)) {
      if (!IMAGE_FIELDS.has(key)) continue;

      const value = plain[key];

      if (
        typeof value === 'string' &&
        value.length > 0 &&
        !value.startsWith('http')
      ) {
        signPromises.push(
          this.fileStorageService
            .getSignedUrl(value)
            .then((url) => {
              plain[key] = url;
            })
            .catch(() => {
              /* keep original value on error */
            }),
        );
      } else if (Array.isArray(value)) {
        const arrayPromises = value.map((item: unknown, index: number) => {
          if (
            typeof item === 'string' &&
            item.length > 0 &&
            !item.startsWith('http')
          ) {
            return this.fileStorageService
              .getSignedUrl(item)
              .then((url) => {
                (plain[key] as unknown[])[index] = url;
              })
              .catch(() => {
                /* keep original value on error */
              });
          }
          return Promise.resolve();
        });
        signPromises.push(...arrayPromises);
      }
    }

    await Promise.all(signPromises);
    return plain;
  }
}
