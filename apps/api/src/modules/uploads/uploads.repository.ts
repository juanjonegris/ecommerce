import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ProductImage as PrismaProductImage,
} from '@prisma/client';

import type { PaginatedResponse, ProductImageStatus } from '@repo/types';

import { PrismaService } from '@/prisma/prisma.service';

import { ProductImageEntity } from './entities/product-image.entity';

export interface CreateProductImageData {
  productId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  order?: number;
}

export interface UpdateProductImageData {
  status?: ProductImageStatus;
  url?: string;
  width?: number | null;
  height?: number | null;
  order?: number;
  sizeBytes?: number;
  mimeType?: string;
}

export interface ListProductImagesFilters {
  productId?: string;
  status?: ProductImageStatus;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

@Injectable()
export class UploadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateProductImageData,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductImageEntity> {
    const client = tx ?? this.prisma;
    const row = await client.productImage.create({
      data: {
        productId: data.productId,
        storageKey: data.storageKey,
        url: data.url,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        width: data.width ?? null,
        height: data.height ?? null,
        order: data.order ?? 0,
        status: 'PENDING_UPLOAD',
      },
    });
    return this.toEntity(row);
  }

  async findById(id: string): Promise<ProductImageEntity | null> {
    const row = await this.prisma.productImage.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByStorageKey(
    storageKey: string,
  ): Promise<ProductImageEntity | null> {
    const row = await this.prisma.productImage.findUnique({
      where: { storageKey },
    });
    return row ? this.toEntity(row) : null;
  }

  async update(
    id: string,
    patch: UpdateProductImageData,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductImageEntity> {
    const client = tx ?? this.prisma;
    const row = await client.productImage.update({
      where: { id },
      data: patch,
    });
    return this.toEntity(row);
  }

  async listByProductForAdmin(
    filters: ListProductImagesFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<ProductImageEntity>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const where: Prisma.ProductImageWhereInput = {
      ...(filters.productId !== undefined
        ? { productId: filters.productId }
        : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productImage.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.productImage.count({ where }),
    ]);
    return { data: rows.map((r) => this.toEntity(r)), total, page, limit };
  }

  async listStalePendingUploads(
    olderThan: Date,
  ): Promise<ProductImageEntity[]> {
    const rows = await this.prisma.productImage.findMany({
      where: { status: 'PENDING_UPLOAD', createdAt: { lt: olderThan } },
      take: 500,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async bulkUpdateOrder(
    items: { id: string; order: number }[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const item of items) {
      await tx.productImage.updateMany({
        where: { id: item.id },
        data: { order: item.order },
      });
    }
  }

  async listByIds(ids: string[]): Promise<ProductImageEntity[]> {
    const rows = await this.prisma.productImage.findMany({
      where: { id: { in: ids } },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async remove(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.productImage.delete({ where: { id } });
  }

  private toEntity(row: PrismaProductImage): ProductImageEntity {
    const e = new ProductImageEntity();
    e.id = row.id;
    e.productId = row.productId;
    e.url = row.url;
    e.order = row.order;
    e.storageKey = row.storageKey;
    e.mimeType = row.mimeType;
    e.sizeBytes = row.sizeBytes;
    e.width = row.width ?? null;
    e.height = row.height ?? null;
    e.status = row.status;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
