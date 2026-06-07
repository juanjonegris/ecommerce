import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Cursor = `Message.id` (cuid). Cuids are sortable so this matches a
 * `createdAt`-ordered list in practice.
 */
export class GetMessagesQueryDto {
  @ApiPropertyOptional({ example: 'clmsg0000000000000000000' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
