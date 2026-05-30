import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import type { Category } from '@repo/types';

export class CreateCategoryDto implements Pick<Category, 'name'> {
  @ApiProperty({ example: 'Electronics', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'cat_abc123' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
