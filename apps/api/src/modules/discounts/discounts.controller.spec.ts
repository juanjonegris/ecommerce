import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserEntity } from '@/modules/auth/entities/user.entity';

import {
  createMockDiscount,
  createMockDiscountValidation,
} from '../../../test/factories/discount.factory';

import { DiscountsController } from './discounts.controller';
import type { DiscountsService } from './discounts.service';

const mockService = {
  validate: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const customer: UserEntity = {
  id: 'user-1',
  email: 'a@a.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('DiscountsController', () => {
  let controller: DiscountsController;

  beforeEach(() => {
    controller = new DiscountsController(
      mockService as unknown as DiscountsService,
    );
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('resolves user identity when a JWT user is present', async () => {
      mockService.validate.mockResolvedValue(createMockDiscountValidation());

      const result = await controller.validate(customer, undefined, {
        code: 'CODE1',
      });

      expect(mockService.validate).toHaveBeenCalledWith('CODE1', {
        type: 'user',
        id: 'user-1',
      });
      expect(result.code).toBe('CODE1');
    });

    it('falls back to guest identity from x-cart-session', async () => {
      mockService.validate.mockResolvedValue(createMockDiscountValidation());

      await controller.validate(undefined, 'sess-abc', { code: 'CODE1' });

      expect(mockService.validate).toHaveBeenCalledWith('CODE1', {
        type: 'guest',
        id: 'sess-abc',
      });
    });

    it('throws BadRequestException when no user and no session', async () => {
      await expect(
        controller.validate(undefined, undefined, { code: 'CODE1' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockService.validate).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('delegates to service and maps to response DTO', async () => {
      mockService.create.mockResolvedValue(
        createMockDiscount({ id: 'd1', code: 'SUMMER10' }),
      );

      const result = await controller.create({
        code: 'SUMMER10',
        percentOff: 10,
      });

      expect(mockService.create).toHaveBeenCalledWith({
        code: 'SUMMER10',
        percentOff: 10,
      });
      expect(result.id).toBe('d1');
      expect(result.code).toBe('SUMMER10');
    });
  });

  describe('remove', () => {
    it('delegates to service.remove', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('d1');

      expect(mockService.remove).toHaveBeenCalledWith('d1');
    });
  });
});
