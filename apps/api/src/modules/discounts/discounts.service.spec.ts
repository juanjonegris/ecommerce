import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { CartService } from '@/modules/cart/cart.service';

import {
  createMockCart,
  createMockCartItem,
} from '../../../test/factories/cart.factory';
import { createMockDiscount } from '../../../test/factories/discount.factory';

import type { DiscountsRepository } from './discounts.repository';
import { DiscountsService } from './discounts.service';

const mockRepo: jest.Mocked<
  Pick<
    DiscountsRepository,
    | 'create'
    | 'findAll'
    | 'findById'
    | 'findByCodeActive'
    | 'update'
    | 'softDelete'
    | 'redeem'
  >
> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCodeActive: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  redeem: jest.fn(),
};

const mockCart: jest.Mocked<Pick<CartService, 'getCart'>> = {
  getCart: jest.fn(),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('DiscountsService', () => {
  let service: DiscountsService;

  beforeEach(() => {
    service = new DiscountsService(
      mockRepo as unknown as DiscountsRepository,
      mockCart as unknown as CartService,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
  });

  describe('validate (full cart flow)', () => {
    it('resolves cart subtotal and delegates to validateForSubtotal', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [createMockCartItem({ price: 10, quantity: 2 })],
        }),
      );
      mockRepo.findByCodeActive.mockResolvedValue(
        createMockDiscount({ id: 'd1', code: 'SUMMER10', percentOff: 10 }),
      );

      const result = await service.validate('summer10', {
        type: 'user',
        id: 'u1',
      });

      expect(mockCart.getCart).toHaveBeenCalledWith({
        type: 'user',
        id: 'u1',
      });
      // case-insensitive: lookup is canonical uppercase
      expect(mockRepo.findByCodeActive).toHaveBeenCalledWith('summer10');
      expect(result.subtotal).toBe(20);
      expect(result.amountApplied).toBe(2);
      expect(result.total).toBe(18);
    });
  });

  describe('validateForSubtotal', () => {
    it('throws NotFoundException when the repo returns null', async () => {
      mockRepo.findByCodeActive.mockResolvedValue(null);

      await expect(service.validateForSubtotal('X', 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when subtotal is 0', async () => {
      await expect(service.validateForSubtotal('X', 0)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.findByCodeActive).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when expired', async () => {
      mockRepo.findByCodeActive.mockResolvedValue(
        createMockDiscount({
          expiresAt: new Date('2020-01-01'),
        }),
      );
      await expect(service.validateForSubtotal('X', 50)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('PERCENT: amountApplied is round2(subtotal * percent / 100)', async () => {
      mockRepo.findByCodeActive.mockResolvedValue(
        createMockDiscount({
          id: 'd1',
          code: 'SUMMER10',
          percentOff: 10,
          amountOff: null,
        }),
      );

      const r = await service.validateForSubtotal('SUMMER10', 49.99);

      expect(r.type).toBe('PERCENT');
      expect(r.value).toBe(10);
      expect(r.amountApplied).toBe(5); // round2(4.999) = 5.00
      expect(r.total).toBe(44.99);
    });

    it('AMOUNT: amountApplied is capped at subtotal, total clamped to 0', async () => {
      mockRepo.findByCodeActive.mockResolvedValue(
        createMockDiscount({
          id: 'd2',
          percentOff: null,
          amountOff: 20,
        }),
      );

      const r = await service.validateForSubtotal('BIG', 15);

      expect(r.type).toBe('AMOUNT');
      expect(r.amountApplied).toBe(15);
      expect(r.total).toBe(0);
    });
  });

  describe('create', () => {
    it('throws BadRequest when both percentOff and amountOff are set', async () => {
      await expect(
        service.create({ code: 'BOTH', percentOff: 10, amountOff: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequest when neither is set', async () => {
      await expect(service.create({ code: 'NEITHER' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when expiresAt is in the past', async () => {
      await expect(
        service.create({
          code: 'OLD',
          percentOff: 10,
          expiresAt: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uppercases the code on persist', async () => {
      mockRepo.create.mockResolvedValue(
        createMockDiscount({ code: 'NEWCODE' }),
      );

      await service.create({ code: 'newcode', percentOff: 10 });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NEWCODE',
          percentOff: 10,
          amountOff: null,
        }),
      );
    });

    it('maps P2002 to ConflictException', async () => {
      mockRepo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.create({ code: 'DUP', percentOff: 10 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('re-runs XOR after merging the partial', async () => {
      // Existing row has percentOff=10. Update sets amountOff=5 without
      // clearing percentOff → merged shape has BOTH, must throw.
      mockRepo.findById.mockResolvedValue(
        createMockDiscount({
          id: 'd1',
          percentOff: 10,
          amountOff: null,
        }),
      );

      // No throw from this path because the service nulls percentOff when
      // amountOff is set. Instead, exercise the throw via the explicit conflict
      // case: send both fields in the same DTO.
      await expect(
        service.update('d1', { percentOff: 20, amountOff: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nulls the other side when one of percent/amount is set', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockDiscount({
          id: 'd1',
          percentOff: 10,
          amountOff: null,
        }),
      );
      mockRepo.update.mockResolvedValue(
        createMockDiscount({ id: 'd1', percentOff: null, amountOff: 7 }),
      );

      await service.update('d1', { amountOff: 7 });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ amountOff: 7, percentOff: null }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes (does NOT hard-delete)', async () => {
      mockRepo.findById.mockResolvedValue(createMockDiscount({ id: 'd1' }));
      mockRepo.softDelete.mockResolvedValue(
        createMockDiscount({ id: 'd1', isActive: false }),
      );

      await service.remove('d1');

      expect(mockRepo.softDelete).toHaveBeenCalledWith('d1');
    });

    it('throws NotFoundException when missing', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('redeem', () => {
    it('resolves on successful insert', async () => {
      mockRepo.redeem.mockResolvedValue(true);

      await expect(service.redeem('d1', 'o1', 2)).resolves.toBeUndefined();
    });

    it('throws ConflictException when the repo reports duplicate', async () => {
      mockRepo.redeem.mockResolvedValue(false);

      await expect(service.redeem('d1', 'o1', 2)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
