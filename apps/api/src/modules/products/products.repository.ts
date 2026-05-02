import { Injectable } from '@nestjs/common';
import type { Prisma, Product as PrismaProduct } from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { PrismaService } from '@/prisma/prisma.service';

import type { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ProductEntity } from './entities/product.entity';

interface CreateData {
  name: string;
  slug: string;
  description: string | null;
  price: number;
  categoryId: string;
}

interface UpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  price?: number;
  categoryId?: string;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductEntity | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findBySlug(slug: string): Promise<ProductEntity | null> {
    const row = await this.prisma.product.findUnique({ where: { slug } });
    return row ? this.toEntity(row) : null;
  }

  async findAll(
    query: FindProductsQueryDto,
  ): Promise<PaginatedResponse<ProductEntity>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sortBy === 'price'
        ? { price: query.order ?? 'asc' }
        : { createdAt: query.order ?? 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.product.count({ where }),
    ]);

    return { data: rows.map((r) => this.toEntity(r)), total, page, limit };
  }

  async create(data: CreateData): Promise<ProductEntity> {
    const row = await this.prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        categoryId: data.categoryId,
      },
    });
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateData): Promise<ProductEntity> {
    const row = await this.prisma.product.update({ where: { id }, data });
    return this.toEntity(row);
  }

  async softDelete(id: string): Promise<ProductEntity> {
    const row = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PrismaProduct): ProductEntity {
    const e = new ProductEntity();
    e.id = row.id;
    e.name = row.name;
    e.slug = row.slug;
    e.description = row.description;
    e.price = Number(row.price);
    e.stock = row.stock;
    e.isActive = row.isActive;
    e.categoryId = row.categoryId;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
