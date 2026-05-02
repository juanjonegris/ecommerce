import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from '@/common/guards/roles.guard';

import { createMockProduct } from '../../../test/factories/product.factory';

import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

const mockService = {
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(() => {
    controller = new ProductsController(
      mockService as unknown as ProductsService,
    );
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('delegates to service and maps entities to response DTOs', async () => {
      const product = createMockProduct();
      mockService.findAll.mockResolvedValue({
        data: [product],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.findAll({});

      expect(mockService.findAll).toHaveBeenCalledWith({});
      expect(result.total).toBe(1);
      const first = result.data[0];
      expect(first).toHaveProperty('createdAt');
      expect(typeof first?.createdAt).toBe('string');
    });
  });

  describe('findOne', () => {
    it('delegates to service and returns a response DTO', async () => {
      const product = createMockProduct({ slug: 'wireless-headphones' });
      mockService.findBySlug.mockResolvedValue(product);

      const result = await controller.findOne('wireless-headphones');

      expect(mockService.findBySlug).toHaveBeenCalledWith(
        'wireless-headphones',
      );
      expect(result.slug).toBe('wireless-headphones');
    });
  });

  describe('create', () => {
    it('delegates to service and returns a response DTO', async () => {
      const dto: CreateProductDto = {
        name: 'New Product',
        price: 19.99,
        categoryId: 'cat-1',
        description: null,
      };
      const product = createMockProduct({ name: 'New Product' });
      mockService.create.mockResolvedValue(product);

      await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('delegates to service and returns a response DTO', async () => {
      const product = createMockProduct({ id: 'p1' });
      mockService.update.mockResolvedValue(product);

      await controller.update('p1', { price: 99 } as UpdateProductDto);

      expect(mockService.update).toHaveBeenCalledWith('p1', { price: 99 });
    });
  });

  describe('remove', () => {
    it('delegates to service', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('p1');

      expect(mockService.remove).toHaveBeenCalledWith('p1');
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
