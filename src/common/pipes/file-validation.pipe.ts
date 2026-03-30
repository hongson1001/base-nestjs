import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';

export interface FileValidationOptions {
  /** Maximum file size in bytes (default: 5MB) */
  maxSize?: number;
  /** Allowed MIME types */
  allowedMimeTypes?: string[];
  /** Whether to verify magic bytes for images (default: true) */
  checkMagicBytes?: boolean;
}

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly options: Required<FileValidationOptions>;

  constructor(options: FileValidationOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      allowedMimeTypes: options.allowedMimeTypes ?? [],
      checkMagicBytes: options.checkMagicBytes ?? true,
    };
  }

  transform(file: UploadedFile): UploadedFile {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.FILE_UPLOAD_FAILED,
        message: 'No file provided',
      });
    }

    // Check file size
    if (file.size > this.options.maxSize) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TOO_LARGE,
        message: `File size ${file.size} exceeds maximum allowed size of ${this.options.maxSize} bytes`,
      });
    }

    // Check MIME type
    if (
      this.options.allowedMimeTypes.length > 0 &&
      !this.options.allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException({
        code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
        message: `File type "${file.mimetype}" is not allowed. Allowed types: ${this.options.allowedMimeTypes.join(', ')}`,
      });
    }

    // Verify magic bytes for known image types
    if (this.options.checkMagicBytes && file.buffer) {
      const expectedBytes = MAGIC_BYTES[file.mimetype];
      if (expectedBytes) {
        const headerBytes = Array.from(
          file.buffer.subarray(0, expectedBytes.length),
        );
        const isValid = expectedBytes.every(
          (byte, index) => headerBytes[index] === byte,
        );
        if (!isValid) {
          throw new BadRequestException({
            code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
            message: `File content does not match declared MIME type "${file.mimetype}"`,
          });
        }
      }
    }

    return file;
  }
}
