import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { DiscountEntity } from '../entities/discount.entity';

export class DiscountResponseDto {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  id!: string;

  @ApiProperty({ example: 'SUMMER10' })
  code!: string;

  @ApiPropertyOptional({ example: 10, nullable: true })
  percentOff!: number | null;

  @ApiPropertyOptional({ example: 5.0, nullable: true })
  amountOff!: number | null;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: DiscountEntity): DiscountResponseDto {
    const dto = new DiscountResponseDto();
    dto.id = entity.id;
    dto.code = entity.code;
    dto.percentOff = entity.percentOff;
    dto.amountOff = entity.amountOff;
    dto.expiresAt = entity.expiresAt ? entity.expiresAt.toISOString() : null;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
