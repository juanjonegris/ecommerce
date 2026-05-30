import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { createMockCategory } from '../../../test/factories/category.factory';

import type { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { CategoryEntity } from './entities/category.entity';

const mockRepo: jest.Mocked<
  Pick<
    CategoriesRepository,
    | 'findAll'
    | 'findRoots'
    | 'findBySlug'
    | 'findById'
    | 'create'
    | 'update'
    | 'delete'
    | 'countProductsByCategoryId'
    | 'countChildrenById'
  >
> = {
  findAll: jest.fn(),
  findRoots: jest.fn(),
  findBySlug: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  countProductsByCategoryId: jest.fn(),
  countChildrenById: jest.fn(),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(() => {
    service = new CategoriesService(
      mockRepo as unknown as CategoriesRepository,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
  });

  describe('findTree', () => {
    it('delegates to repository.findRoots', async () => {
      const root = createMockCategory({ slug: 'root' });
      mockRepo.findRoots.mockResolvedValue([root as unknown as CategoryEntity]);

      await expect(service.findTree()).resolves.toEqual([root]);
      expect(mockRepo.findRoots).toHaveBeenCalledTimes(1);
    });
  });

  describe('findBySlug', () => {
    it('returns category when found', async () => {
      const category = createMockCategory({ slug: 'found' });
      mockRepo.findBySlug.mockResolvedValue(
        category as unknown as CategoryEntity,
      );

      await expect(service.findBySlug('found')).resolves.toEqual(category);
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const dto: CreateCategoryDto = { name: 'Test Category' };

    it('creates category with slug generated from name', async () => {
      const category = createMockCategory({
        name: 'Test Category',
        slug: 'test-category',
      });
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(category as unknown as CategoryEntity);

      const result = await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'test-category', parentId: null }),
      );
      expect(result).toEqual(category);
    });

    it('throws ConflictException when slug already exists', async () => {
      const existing = createMockCategory({ slug: 'test-category' });
      mockRepo.findBySlug.mockResolvedValue(
        existing as unknown as CategoryEntity,
      );

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when parentId does not exist', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Child', parentId: 'missing-parent' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', {} as UpdateCategoryDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when setting parent to itself', async () => {
      const current = createMockCategory({ id: 'c1', name: 'Cat 1' });
      mockRepo.findById.mockResolvedValue(current as unknown as CategoryEntity);

      await expect(
        service.update('c1', { parentId: 'c1' } as UpdateCategoryDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when setting parent to a descendant (cycle)', async () => {
      const c1 = createMockCategory({
        id: 'c1',
        name: 'Cat 1',
        parentId: null,
      });
      // c2 is a child of c1; moving c1 under c2 would create a cycle.
      const c2 = createMockCategory({
        id: 'c2',
        name: 'Cat 2',
        parentId: 'c1',
      });
      mockRepo.findById.mockImplementation((id: string) => {
        if (id === 'c1')
          return Promise.resolve(c1 as unknown as CategoryEntity);
        if (id === 'c2')
          return Promise.resolve(c2 as unknown as CategoryEntity);
        return Promise.resolve(null);
      });

      await expect(
        service.update('c1', { parentId: 'c2' } as UpdateCategoryDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('regenerates slug when name changes and new slug is unique', async () => {
      const current = createMockCategory({
        id: 'c1',
        name: 'Old Name',
        slug: 'old-name',
      });
      const updated = createMockCategory({
        id: 'c1',
        name: 'New Name',
        slug: 'new-name',
      });
      mockRepo.findById.mockResolvedValue(current as unknown as CategoryEntity);
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.update.mockResolvedValue(updated as unknown as CategoryEntity);

      await service.update('c1', { name: 'New Name' } as UpdateCategoryDto);

      expect(mockRepo.update).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ slug: 'new-name' }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when products are assigned', async () => {
      const category = createMockCategory({ id: 'c1' });
      mockRepo.findById.mockResolvedValue(
        category as unknown as CategoryEntity,
      );
      mockRepo.countProductsByCategoryId.mockResolvedValue(3);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the category has children', async () => {
      const category = createMockCategory({ id: 'c1' });
      mockRepo.findById.mockResolvedValue(
        category as unknown as CategoryEntity,
      );
      mockRepo.countProductsByCategoryId.mockResolvedValue(0);
      mockRepo.countChildrenById.mockResolvedValue(2);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes when no products or children are assigned', async () => {
      const category = createMockCategory({ id: 'c1' });
      mockRepo.findById.mockResolvedValue(
        category as unknown as CategoryEntity,
      );
      mockRepo.countProductsByCategoryId.mockResolvedValue(0);
      mockRepo.countChildrenById.mockResolvedValue(0);

      await service.remove('c1');

      expect(mockRepo.delete).toHaveBeenCalledWith('c1');
    });
  });
});
