import {
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { PaginatedResponse } from '@repo/types';

import type { CreateProductDto } from './dto/create-product.dto';
import type { FindProductsQueryDto } from './dto/find-products-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly repository: ProductsRepository,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async findAll(
    query: FindProductsQueryDto,
  ): Promise<PaginatedResponse<ProductEntity>> {
    return this.repository.findAll(query);
  }

  async findBySlug(slug: string): Promise<ProductEntity> {
    const product = await this.repository.findBySlug(slug);
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return product;
  }

  async create(dto: CreateProductDto): Promise<ProductEntity> {
    const requestId = this.cls.getId();
    const slug = slugify(dto.name);

    this.logger.log({
      message: 'product.service.create_started',
      requestId,
      slug,
    });

    const existing = await this.repository.findBySlug(slug);
    if (existing)
      throw new ConflictException(`Product with slug "${slug}" already exists`);

    const product = await this.repository.create({
      name: dto.name,
      slug,
      description: dto.description,
      price: dto.price,
      categoryId: dto.categoryId,
    });

    this.logger.log({
      message: 'product.service.create_succeeded',
      requestId,
      productId: product.id,
    });

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    const requestId = this.cls.getId();

    this.logger.log({
      message: 'product.service.update_started',
      requestId,
      productId: id,
    });

    const current = await this.repository.findById(id);
    if (!current)
      throw new NotFoundException(`Product with ID "${id}" not found`);

    let slug: string | undefined;
    if (dto.name !== undefined && dto.name !== current.name) {
      slug = slugify(dto.name);
      const slugOwner = await this.repository.findBySlug(slug);
      if (slugOwner && slugOwner.id !== id) {
        throw new ConflictException(
          `Product with slug "${slug}" already exists`,
        );
      }
    }

    const patch: Parameters<ProductsRepository['update']>[1] = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.price !== undefined) patch.price = dto.price;
    if (dto.categoryId !== undefined) patch.categoryId = dto.categoryId;
    if (slug !== undefined) patch.slug = slug;

    const product = await this.repository.update(id, patch);

    this.logger.log({
      message: 'product.service.update_succeeded',
      requestId,
      productId: id,
    });

    return product;
  }

  async remove(id: string): Promise<void> {
    const requestId = this.cls.getId();

    this.logger.log({
      message: 'product.service.remove_started',
      requestId,
      productId: id,
    });

    const current = await this.repository.findById(id);
    if (!current)
      throw new NotFoundException(`Product with ID "${id}" not found`);

    await this.repository.softDelete(id);

    this.logger.log({
      message: 'product.service.remove_succeeded',
      requestId,
      productId: id,
    });
  }
}
