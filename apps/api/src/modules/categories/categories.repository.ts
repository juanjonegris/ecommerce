import { Injectable } from '@nestjs/common';
import type { Category as PrismaCategory } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { CategoryEntity } from './entities/category.entity';

interface CreateData {
  name: string;
  slug: string;
  parentId: string | null;
}

interface UpdateData {
  name?: string;
  slug?: string;
  parentId?: string;
}

type CategoryWithChildren = PrismaCategory & { children: PrismaCategory[] };

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CategoryEntity[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async findRoots(): Promise<CategoryEntity[]> {
    const rows = await this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toEntityWithChildren(r));
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findUnique({ where: { slug } });
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateData): Promise<CategoryEntity> {
    const row = await this.prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        parentId: data.parentId,
      },
    });
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateData): Promise<CategoryEntity> {
    const row = await this.prisma.category.update({ where: { id }, data });
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async countProductsByCategoryId(id: string): Promise<number> {
    return this.prisma.product.count({ where: { categoryId: id } });
  }

  async countChildrenById(id: string): Promise<number> {
    return this.prisma.category.count({ where: { parentId: id } });
  }

  private toEntity(row: PrismaCategory): CategoryEntity {
    const e = new CategoryEntity();
    e.id = row.id;
    e.name = row.name;
    e.slug = row.slug;
    e.parentId = row.parentId;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }

  private toEntityWithChildren(row: CategoryWithChildren): CategoryEntity {
    const e = this.toEntity(row);
    e.children = row.children.map((c) => this.toEntity(c));
    return e;
  }
}
