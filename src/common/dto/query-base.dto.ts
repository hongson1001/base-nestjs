import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto.js';

export class QueryBaseDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
