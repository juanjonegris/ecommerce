import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Product } from '@repo/types';

export class ProductResponseDto {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  id!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug!: string;

  @ApiPropertyOptional({
    example: 'Over-ear Bluetooth headphones with noise cancelling.',
  })
  description!: string | null;

  @ApiProperty({ example: 79.99 })
  price!: number;

  @ApiProperty({ example: 50 })
  stock!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 'cat_abc123' })
  categoryId!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: Product): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.slug = entity.slug;
    dto.description = entity.description;
    dto.price = entity.price;
    dto.stock = entity.stock;
    dto.isActive = entity.isActive;
    dto.categoryId = entity.categoryId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
