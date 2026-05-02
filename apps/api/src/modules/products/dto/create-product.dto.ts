import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import type { Product } from '@repo/types';

export class CreateProductDto implements Pick<
  Product,
  'name' | 'price' | 'categoryId' | 'description'
> {
  @ApiProperty({ example: 'Wireless Headphones', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'Over-ear Bluetooth headphones with noise cancelling.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description: string | null = null;

  @ApiProperty({ example: 79.99, minimum: 0 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'cat_abc123' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;
}
