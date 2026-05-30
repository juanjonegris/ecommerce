import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from '@/common/guards/roles.guard';
import type { UserEntity } from '@/modules/auth/entities/user.entity';

import { createMockOrder } from '../../../test/factories/order.factory';

import type { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  transitionStatus: jest.fn(),
  cancel: jest.fn(),
};

const customer: UserEntity = {
  id: 'user-1',
  email: 'buyer@example.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'hash',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(() => {
    controller = new OrdersController(mockService as unknown as OrdersService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated results scoped to the current user', async () => {
      const order = createMockOrder({ id: 'o1', customerId: 'user-1' });
      mockService.findAll.mockResolvedValue({
        data: [order],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.findAll(
        customer,
        {} as FindOrdersQueryDto,
      );

      expect(mockService.findAll).toHaveBeenCalledWith(
        'user-1',
        UserRole.CUSTOMER,
        {},
      );
      expect(result.total).toBe(1);
      expect(result.data[0]?.id).toBe('o1');
    });
  });

  describe('cancel', () => {
    it('propagates the service Forbidden when a customer cancels a CONFIRMED order', async () => {
      mockService.cancel.mockRejectedValue(new ForbiddenException());

      await expect(controller.cancel(customer, 'o1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockService.cancel).toHaveBeenCalledWith('o1', customer);
    });
  });
});

describe('Orders RolesGuard (PATCH /:id/status)', () => {
  function makeContext(role: UserRole): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('rejects non-admin users', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext(UserRole.CUSTOMER))).toThrow(
      ForbiddenException,
    );
  });

  it('allows admin users', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });
});
