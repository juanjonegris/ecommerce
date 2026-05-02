import { ConflictException, NotFoundException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { createMockProduct } from '../../../test/factories/product.factory';

import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { ProductEntity } from './entities/product.entity';
import type { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const mockRepo: jest.Mocked<
  Pick<
    ProductsRepository,
    'findAll' | 'findById' | 'findBySlug' | 'create' | 'update' | 'softDelete'
  >
> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(() => {
    service = new ProductsService(
      mockRepo as unknown as ProductsRepository,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
  });

  describe('findBySlug', () => {
    it('returns product when found', async () => {
      const product = createMockProduct({ slug: 'found-product' });
      mockRepo.findBySlug.mockResolvedValue(
        product as unknown as ProductEntity,
      );

      await expect(service.findBySlug('found-product')).resolves.toEqual(
        product,
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const dto: CreateProductDto = {
      name: 'Test Product',
      price: 29.99,
      categoryId: 'cat-1',
      description: null,
    };

    it('creates product with slug generated from name', async () => {
      const product = createMockProduct({
        name: 'Test Product',
        slug: 'test-product',
      });
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(product as unknown as ProductEntity);

      const result = await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'test-product' }),
      );
      expect(result).toEqual(product);
    });

    it('throws ConflictException when slug already exists', async () => {
      const existing = createMockProduct({ slug: 'test-product' });
      mockRepo.findBySlug.mockResolvedValue(
        existing as unknown as ProductEntity,
      );

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('preserves slug when name is unchanged', async () => {
      const current = createMockProduct({
        id: 'p1',
        name: 'My Product',
        slug: 'my-product',
      });
      const updated = createMockProduct({
        id: 'p1',
        name: 'My Product',
        slug: 'my-product',
      });
      mockRepo.findById.mockResolvedValue(current as unknown as ProductEntity);
      mockRepo.update.mockResolvedValue(updated as unknown as ProductEntity);

      await service.update('p1', { price: 39.99 } as UpdateProductDto);

      expect(mockRepo.update).toHaveBeenCalledWith(
        'p1',
        expect.not.objectContaining({ slug: expect.anything() }),
      );
    });

    it('regenerates slug when name changes and new slug is unique', async () => {
      const current = createMockProduct({
        id: 'p1',
        name: 'Old Name',
        slug: 'old-name',
      });
      const updated = createMockProduct({
        id: 'p1',
        name: 'New Name',
        slug: 'new-name',
      });
      mockRepo.findById.mockResolvedValue(current as unknown as ProductEntity);
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.update.mockResolvedValue(updated as unknown as ProductEntity);

      await service.update('p1', { name: 'New Name' } as UpdateProductDto);

      expect(mockRepo.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ slug: 'new-name' }),
      );
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', {} as UpdateProductDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when new slug is taken by a different product', async () => {
      const current = createMockProduct({ id: 'p1', name: 'Old', slug: 'old' });
      const conflict = createMockProduct({ id: 'p2', slug: 'new-name' });
      mockRepo.findById.mockResolvedValue(current as unknown as ProductEntity);
      mockRepo.findBySlug.mockResolvedValue(
        conflict as unknown as ProductEntity,
      );

      await expect(
        service.update('p1', { name: 'New Name' } as UpdateProductDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('calls softDelete to set isActive=false', async () => {
      const product = createMockProduct({ id: 'p1', isActive: true });
      mockRepo.findById.mockResolvedValue(product as unknown as ProductEntity);
      mockRepo.softDelete.mockResolvedValue({
        ...product,
        isActive: false,
      } as unknown as ProductEntity);

      await service.remove('p1');

      expect(mockRepo.softDelete).toHaveBeenCalledWith('p1');
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
