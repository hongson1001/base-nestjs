import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';
import { ErrorCode } from '../constants/error-codes.js';

@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_OBJECT_ID,
        message: `"${value}" is not a valid MongoDB ObjectId`,
      });
    }
    return value;
  }
}
