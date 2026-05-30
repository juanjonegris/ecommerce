import { ApiProperty } from '@nestjs/swagger';

import type { Category } from '@repo/types';

import type { CategoryEntity } from '../entities/category.entity';

export class CategoryResponseDto {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  id!: string;

  @ApiProperty({ example: 'Electronics' })
  name!: string;

  @ApiProperty({ example: 'electronics' })
  slug!: string;

  @ApiProperty({ example: 'cat_parent123', nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: Category): CategoryResponseDto {
    const dto = new CategoryResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.slug = entity.slug;
    dto.parentId = entity.parentId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

export class CategoryTreeResponseDto extends CategoryResponseDto {
  @ApiProperty({ type: () => [CategoryTreeResponseDto] })
  children!: CategoryTreeResponseDto[];

  static fromTree(entity: CategoryEntity): CategoryTreeResponseDto {
    const dto = new CategoryTreeResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.slug = entity.slug;
    dto.parentId = entity.parentId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    dto.children = (entity.children ?? []).map((child) =>
      CategoryTreeResponseDto.fromTree(child),
    );
    return dto;
  }
}
