import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe } from './file-validation.pipe.js';
import { ErrorCode } from '../constants/error-codes.js';

describe('FileValidationPipe', () => {
  const createFile = (overrides: Record<string, unknown> = {}) => ({
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    ...overrides,
  });

  it('should pass valid file within size limit', () => {
    const pipe = new FileValidationPipe({ maxSize: 5000 });
    const file = createFile({ size: 1000 });

    expect(pipe.transform(file as any)).toEqual(file);
  });

  it('should throw FILE_TOO_LARGE for oversized file', () => {
    const pipe = new FileValidationPipe({ maxSize: 500 });
    const file = createFile({ size: 1000 });

    try {
      pipe.transform(file as any);
      fail('Expected BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.code).toBe(ErrorCode.FILE_TOO_LARGE);
    }
  });

  it('should throw FILE_TYPE_NOT_ALLOWED for disallowed MIME type', () => {
    const pipe = new FileValidationPipe({
      allowedMimeTypes: ['image/png'],
    });
    const file = createFile({ mimetype: 'image/jpeg' });

    try {
      pipe.transform(file as any);
      fail('Expected BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.code).toBe(ErrorCode.FILE_TYPE_NOT_ALLOWED);
    }
  });

  it('should throw for magic bytes mismatch (claims jpeg but has PNG bytes)', () => {
    const pipe = new FileValidationPipe({ checkMagicBytes: true });
    // PNG magic bytes: 0x89, 0x50, 0x4e, 0x47
    const file = createFile({
      mimetype: 'image/jpeg',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });

    try {
      pipe.transform(file as any);
      fail('Expected BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.code).toBe(ErrorCode.FILE_TYPE_NOT_ALLOWED);
      expect(response.message).toContain('does not match');
    }
  });

  it('should throw for no file provided', () => {
    const pipe = new FileValidationPipe();

    try {
      pipe.transform(null as any);
      fail('Expected BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.code).toBe(ErrorCode.FILE_UPLOAD_FAILED);
    }
  });
});
