import { BadRequestException } from '@nestjs/common';
import { ParseMongoIdPipe } from './parse-mongo-id.pipe.js';
import { ErrorCode } from '../constants/error-codes.js';

describe('ParseMongoIdPipe', () => {
  let pipe: ParseMongoIdPipe;

  beforeEach(() => {
    pipe = new ParseMongoIdPipe();
  });

  it('should pass valid ObjectId', () => {
    const validId = '507f1f77bcf86cd799439011';
    expect(pipe.transform(validId)).toBe(validId);
  });

  it('should throw BadRequestException for invalid ObjectId', () => {
    expect(() => pipe.transform('not-an-id')).toThrow(BadRequestException);
  });

  it('should throw for random string', () => {
    try {
      pipe.transform('hello-world');
      fail('Expected BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.code).toBe(ErrorCode.INVALID_OBJECT_ID);
    }
  });

  it('should throw for empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });
});
