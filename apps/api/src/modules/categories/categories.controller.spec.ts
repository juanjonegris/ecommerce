import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from '@/common/guards/roles.guard';

import { createMockCategory } from '../../../test/factories/category.factory';

import { CategoriesController } from './categories.controller';
import type { CategoriesService } from './categories.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

const mockService = {
  findAll: jest.fn(),
  findTree: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(() => {
    controller = new CategoriesController(
      mockService as unknown as CategoriesService,
    );
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('delegates to service and maps entities to response DTOs', async () => {
      const category = createMockCategory();
      mockService.findAll.mockResolvedValue([category]);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledTimes(1);
      const first = result[0];
      expect(first).toHaveProperty('createdAt');
      expect(typeof first?.createdAt).toBe('string');
    });
  });

  describe('findTree', () => {
    it('delegates to service.findTree and maps to tree DTOs with children', async () => {
      const child = createMockCategory({ id: 'c2', parentId: 'c1' });
      const root = createMockCategory({ id: 'c1', parentId: null });
      mockService.findTree.mockResolvedValue([{ ...root, children: [child] }]);

      const result = await controller.findTree();

      expect(mockService.findTree).toHaveBeenCalledTimes(1);
      const first = result[0];
      expect(Array.isArray(first?.children)).toBe(true);
      expect(first?.children[0]?.id).toBe('c2');
    });
  });

  describe('findOne', () => {
    it('delegates to service with the slug', async () => {
      const category = createMockCategory({ slug: 'electronics' });
      mockService.findBySlug.mockResolvedValue(category);

      const result = await controller.findOne('electronics');

      expect(mockService.findBySlug).toHaveBeenCalledWith('electronics');
      expect(result.slug).toBe('electronics');
    });
  });

  describe('create', () => {
    it('delegates to service and returns a response DTO', async () => {
      const dto: CreateCategoryDto = { name: 'Electronics' };
      const category = createMockCategory({ name: 'Electronics' });
      mockService.create.mockResolvedValue(category);

      await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('delegates to service and returns a response DTO', async () => {
      const category = createMockCategory({ id: 'c1' });
      mockService.update.mockResolvedValue(category);

      await controller.update('c1', { name: 'Renamed' } as UpdateCategoryDto);

      expect(mockService.update).toHaveBeenCalledWith('c1', {
        name: 'Renamed',
      });
    });
  });

  describe('remove', () => {
    it('delegates to service', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('c1');

      expect(mockService.remove).toHaveBeenCalledWith('c1');
    });
  });
});

describe('RolesGuard (admin endpoints)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function makeContext(userRole?: UserRole): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () =>
          userRole !== undefined ? { user: { role: userRole } } : {},
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(UserRole.CUSTOMER))).toBe(true);
  });

  it('allows admin user to access admin-only endpoint', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('throws ForbiddenException for non-admin user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(makeContext(UserRole.CUSTOMER))).toThrow(
      ForbiddenException,
    );
  });

  it('throws UnauthorizedException when request has no user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(makeContext())).toThrow(
      UnauthorizedException,
    );
  });
});
