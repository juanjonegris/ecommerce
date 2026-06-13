import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ProductImageStatus } from '@repo/types';

import type { ProductImageEntity } from '../entities/product-image.entity';

/**
 * Outbound shape. INTENTIONALLY OMITS `storageKey` (D6) — admins see only
 * the public `url`. The static `from` mapper enforces the strip.
 */
export class ProductImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 524288 })
  sizeBytes!: number;

  @ApiPropertyOptional({ example: 1200, nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ example: 800, nullable: true })
  height!: number | null;

  @ApiProperty({ enum: ['PENDING_UPLOAD', 'READY'] })
  status!: ProductImageStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(entity: ProductImageEntity): ProductImageResponseDto {
    const dto = new ProductImageResponseDto();
    dto.id = entity.id;
    dto.productId = entity.productId;
    dto.url = entity.url;
    dto.order = entity.order;
    dto.mimeType = entity.mimeType;
    dto.sizeBytes = entity.sizeBytes;
    dto.width = entity.width;
    dto.height = entity.height;
    dto.status = entity.status;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
