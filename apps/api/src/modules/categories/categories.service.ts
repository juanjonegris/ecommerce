import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import { CategoriesRepository } from './categories.repository';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { CategoryEntity } from './entities/category.entity';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async findAll(): Promise<CategoryEntity[]> {
    return this.repository.findAll();
  }

  async findTree(): Promise<CategoryEntity[]> {
    return this.repository.findRoots();
  }

  async findBySlug(slug: string): Promise<CategoryEntity> {
    const category = await this.repository.findBySlug(slug);
    if (!category) throw new NotFoundException(`Category "${slug}" not found`);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const requestId = this.cls.getId();
    const slug = slugify(dto.name);

    this.logger.log({
      message: 'category.service.create_started',
      requestId,
      slug,
    });

    const existing = await this.repository.findBySlug(slug);
    if (existing)
      throw new ConflictException(
        `Category with slug "${slug}" already exists`,
      );

    if (dto.parentId !== undefined) {
      const parent = await this.repository.findById(dto.parentId);
      if (!parent)
        throw new NotFoundException(
          `Parent category "${dto.parentId}" not found`,
        );
    }

    const category = await this.repository.create({
      name: dto.name,
      slug,
      parentId: dto.parentId ?? null,
    });

    this.logger.log({
      message: 'category.service.create_succeeded',
      requestId,
      categoryId: category.id,
    });

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const requestId = this.cls.getId();

    this.logger.log({
      message: 'category.service.update_started',
      requestId,
      categoryId: id,
    });

    const current = await this.repository.findById(id);
    if (!current)
      throw new NotFoundException(`Category with ID "${id}" not found`);

    let slug: string | undefined;
    if (dto.name !== undefined && dto.name !== current.name) {
      slug = slugify(dto.name);
      const slugOwner = await this.repository.findBySlug(slug);
      if (slugOwner && slugOwner.id !== id) {
        throw new ConflictException(
          `Category with slug "${slug}" already exists`,
        );
      }
    }

    if (dto.parentId !== undefined) {
      await this.assertNoCycle(id, dto.parentId);
    }

    const patch: Parameters<CategoriesRepository['update']>[1] = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.parentId !== undefined) patch.parentId = dto.parentId;
    if (slug !== undefined) patch.slug = slug;

    const category = await this.repository.update(id, patch);

    this.logger.log({
      message: 'category.service.update_succeeded',
      requestId,
      categoryId: id,
    });

    return category;
  }

  async remove(id: string): Promise<void> {
    const requestId = this.cls.getId();

    this.logger.log({
      message: 'category.service.remove_started',
      requestId,
      categoryId: id,
    });

    const current = await this.repository.findById(id);
    if (!current)
      throw new NotFoundException(`Category with ID "${id}" not found`);

    const productCount = await this.repository.countProductsByCategoryId(id);
    if (productCount > 0)
      throw new ConflictException(
        'Cannot delete a category that has products assigned',
      );

    const childCount = await this.repository.countChildrenById(id);
    if (childCount > 0)
      throw new ConflictException(
        'Cannot delete a category that has children; delete the children first',
      );

    await this.repository.delete(id);

    this.logger.log({
      message: 'category.service.remove_succeeded',
      requestId,
      categoryId: id,
    });
  }

  // Rejects setting a category's parent to itself or to one of its descendants
  // (which would create a cycle). Walks up from the proposed parent; if we reach
  // the category being updated, the proposed parent is a descendant of it.
  private async assertNoCycle(
    categoryId: string,
    newParentId: string,
  ): Promise<void> {
    let cursor: string | null = newParentId;
    while (cursor) {
      if (cursor === categoryId) {
        throw new BadRequestException(
          'A category cannot be its own parent or a descendant of itself',
        );
      }
      const node = await this.repository.findById(cursor);
      if (!node)
        throw new NotFoundException(
          `Parent category "${newParentId}" not found`,
        );
      cursor = node.parentId;
    }
  }
}
