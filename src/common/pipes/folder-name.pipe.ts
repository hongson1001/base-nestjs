import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';

/**
 * Whitelist folder param cho upload endpoint — chống path traversal.
 *
 * Thêm folder mới vào `ALLOWED_FOLDERS` khi cần. Mặc định rỗng (base skeleton),
 * module sử dụng tự bổ sung hoặc override whitelist qua constructor.
 */
export const ALLOWED_FOLDERS: ReadonlySet<string> = new Set<string>([
  // Ví dụ: 'products', 'users', 'categories'
]);

@Injectable()
export class FolderNamePipe implements PipeTransform<string, string> {
  private readonly allowed: ReadonlySet<string>;

  constructor(allowed?: ReadonlySet<string>) {
    this.allowed = allowed ?? ALLOWED_FOLDERS;
  }

  transform(value: string): string {
    if (!value || !this.allowed.has(value)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid folder name '${value}'`,
      });
    }
    return value;
  }
}
