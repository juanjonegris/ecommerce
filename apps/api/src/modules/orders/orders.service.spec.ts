import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { OrderStatus, type Prisma, UserRole } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { CartService } from '@/modules/cart/cart.service';
import type { DiscountsService } from '@/modules/discounts/discounts.service';
import type { ProductEntity } from '@/modules/products/entities/product.entity';
import type { ProductsRepository } from '@/modules/products/products.repository';
import type { PrismaService } from '@/prisma/prisma.service';
import type { EmailQueue } from '@/queues/emails/email-queue.service';

import {
  createMockCart,
  createMockCartItem,
} from '../../../test/factories/cart.factory';
import { createMockOrder } from '../../../test/factories/order.factory';
import { createMockProduct } from '../../../test/factories/product.factory';

import type { CreateOrderDto } from './dto/create-order.dto';
import type { OrderEntity } from './entities/order.entity';
import type { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const mockRepo: jest.Mocked<
  Pick<
    OrdersRepository,
    | 'create'
    | 'findAll'
    | 'findById'
    | 'updateStatus'
    | 'confirmAndDecrementStock'
    | 'findCustomerEmail'
  >
> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  confirmAndDecrementStock: jest.fn(),
  findCustomerEmail: jest.fn(),
};

const mockProductsRepo: jest.Mocked<Pick<ProductsRepository, 'findById'>> = {
  findById: jest.fn(),
};

const mockCart: jest.Mocked<Pick<CartService, 'getCart' | 'clear'>> = {
  getCart: jest.fn(),
  clear: jest.fn(),
};

const mockDiscounts: jest.Mocked<
  Pick<DiscountsService, 'validateForSubtotal' | 'redeem'>
> = {
  validateForSubtotal: jest.fn(),
  redeem: jest.fn(),
};

// PrismaService.$transaction(callback) — invoke the callback with a stub tx
// object. The OrdersRepository mock ignores the tx anyway.
const mockPrisma = {
  $transaction: jest.fn(
    async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      cb({} as Prisma.TransactionClient),
  ),
};

const mockEmailQueue: jest.Mocked<
  Pick<EmailQueue, 'enqueueOrderConfirmation'>
> = {
  enqueueOrderConfirmation: jest.fn(),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

const user: UserEntity = {
  id: 'user-1',
  email: 'buyer@example.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'hash',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      mockRepo as unknown as OrdersRepository,
      mockProductsRepo as unknown as ProductsRepository,
      mockCart as unknown as CartService,
      mockDiscounts as unknown as DiscountsService,
      mockPrisma as unknown as PrismaService,
      mockEmailQueue as unknown as EmailQueue,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
    // Re-install the default $transaction passthrough after clearAllMocks.
    mockPrisma.$transaction.mockImplementation(
      async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>) =>
        cb({} as Prisma.TransactionClient),
    );
  });

  describe('create', () => {
    const dto: CreateOrderDto = {};

    it('throws BadRequestException on empty cart', async () => {
      mockCart.getCart.mockResolvedValue(createMockCart({ items: [] }));

      await expect(service.create(user, undefined, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a product is inactive', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [createMockCartItem({ productId: 'p1', quantity: 1 })],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          id: 'p1',
          isActive: false,
        }) as unknown as ProductEntity,
      );

      await expect(service.create(user, undefined, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on insufficient stock', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [createMockCartItem({ productId: 'p1', quantity: 10 })],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          id: 'p1',
          isActive: true,
          stock: 3,
        }) as unknown as ProductEntity,
      );

      await expect(service.create(user, undefined, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('creates the order and clears the cart, but does NOT enqueue an email (payment-pending)', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [
            createMockCartItem({ productId: 'p1', price: 10, quantity: 2 }),
            createMockCartItem({ productId: 'p2', price: 5, quantity: 1 }),
          ],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          isActive: true,
          stock: 100,
        }) as unknown as ProductEntity,
      );
      const created = createMockOrder({ id: 'o1', total: 25 });
      mockRepo.create.mockResolvedValue(created);

      const result = await service.create(user, undefined, dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'user-1',
          total: 25,
          discountCodeId: null,
          discountAmount: null,
        }),
        expect.anything(),
      );
      expect(mockDiscounts.validateForSubtotal).not.toHaveBeenCalled();
      expect(mockDiscounts.redeem).not.toHaveBeenCalled();
      expect(mockCart.clear).toHaveBeenCalledWith({
        type: 'user',
        id: 'user-1',
      });
      expect(mockEmailQueue.enqueueOrderConfirmation).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('applies a valid discountCode: persists discountCodeId/Amount, calls redeem', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [
            createMockCartItem({ productId: 'p1', price: 10, quantity: 2 }),
          ],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          isActive: true,
          stock: 100,
        }) as unknown as ProductEntity,
      );
      mockDiscounts.validateForSubtotal.mockResolvedValue({
        code: 'SUMMER10',
        discountId: 'disc-1',
        type: 'PERCENT',
        value: 10,
        amountApplied: 2,
        subtotal: 20,
        total: 18,
      });
      const created = createMockOrder({ id: 'o1', total: 18 });
      mockRepo.create.mockResolvedValue(created);

      await service.create(user, undefined, { discountCode: 'SUMMER10' });

      expect(mockDiscounts.validateForSubtotal).toHaveBeenCalledWith(
        'SUMMER10',
        20,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 18,
          discountCodeId: 'disc-1',
          discountAmount: 2,
        }),
        expect.anything(),
      );
      expect(mockDiscounts.redeem).toHaveBeenCalledWith(
        'disc-1',
        'o1',
        2,
        expect.anything(),
      );
    });

    it('propagates BadRequestException from validateForSubtotal — no order created', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [
            createMockCartItem({ productId: 'p1', price: 10, quantity: 1 }),
          ],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          isActive: true,
          stock: 100,
        }) as unknown as ProductEntity,
      );
      mockDiscounts.validateForSubtotal.mockRejectedValue(
        new BadRequestException('Discount code expired'),
      );

      await expect(
        service.create(user, undefined, { discountCode: 'OLD' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists total=0 when discount amount >= subtotal (clamped by service)', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [
            createMockCartItem({ productId: 'p1', price: 5, quantity: 1 }),
          ],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          isActive: true,
          stock: 100,
        }) as unknown as ProductEntity,
      );
      mockDiscounts.validateForSubtotal.mockResolvedValue({
        code: 'BIG',
        discountId: 'disc-2',
        type: 'AMOUNT',
        value: 20,
        amountApplied: 5,
        subtotal: 5,
        total: 0,
      });
      mockRepo.create.mockResolvedValue(
        createMockOrder({ id: 'o2', total: 0 }),
      );

      await service.create(user, undefined, { discountCode: 'BIG' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ total: 0, discountAmount: 5 }),
        expect.anything(),
      );
    });

    it('propagates ConflictException from redeem and does not clear the cart', async () => {
      mockCart.getCart.mockResolvedValue(
        createMockCart({
          items: [
            createMockCartItem({ productId: 'p1', price: 10, quantity: 1 }),
          ],
        }),
      );
      mockProductsRepo.findById.mockResolvedValue(
        createMockProduct({
          isActive: true,
          stock: 100,
        }) as unknown as ProductEntity,
      );
      mockDiscounts.validateForSubtotal.mockResolvedValue({
        code: 'DUP',
        discountId: 'disc-3',
        type: 'PERCENT',
        value: 10,
        amountApplied: 1,
        subtotal: 10,
        total: 9,
      });
      mockRepo.create.mockResolvedValue(
        createMockOrder({ id: 'o3', total: 9 }),
      );
      mockDiscounts.redeem.mockRejectedValue(
        new ConflictException('Discount already redeemed for this order'),
      );

      await expect(
        service.create(user, undefined, { discountCode: 'DUP' }),
      ).rejects.toThrow(ConflictException);
      expect(mockCart.clear).not.toHaveBeenCalled();
    });
  });

  describe('markPaid', () => {
    it('PENDING → CONFIRMED: decrements stock, enqueues confirmation email', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.PENDING }),
      );
      const confirmed = createMockOrder({
        id: 'o1',
        status: OrderStatus.CONFIRMED,
        total: 42,
      });
      mockRepo.confirmAndDecrementStock.mockResolvedValue(confirmed);
      mockRepo.findCustomerEmail.mockResolvedValue('buyer@example.com');

      const result = await service.markPaid('o1');

      expect(mockRepo.confirmAndDecrementStock).toHaveBeenCalledWith('o1');
      expect(mockEmailQueue.enqueueOrderConfirmation).toHaveBeenCalledWith({
        to: 'buyer@example.com',
        orderId: 'o1',
        total: 42,
      });
      expect(result).toBe(confirmed);
    });

    it('already-CONFIRMED is a no-op (idempotent)', async () => {
      const existing = createMockOrder({
        id: 'o1',
        status: OrderStatus.CONFIRMED,
      });
      mockRepo.findById.mockResolvedValue(existing);

      const result = await service.markPaid('o1');

      expect(result).toBe(existing);
      expect(mockRepo.confirmAndDecrementStock).not.toHaveBeenCalled();
      expect(mockEmailQueue.enqueueOrderConfirmation).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when order is in a non-payable state', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.CANCELLED }),
      );

      await expect(service.markPaid('o1')).rejects.toThrow(BadRequestException);
      expect(mockRepo.confirmAndDecrementStock).not.toHaveBeenCalled();
    });

    it('propagates OutOfStockError so the caller can mark payment FAILED', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.PENDING }),
      );
      const { OutOfStockError } =
        await import('@/modules/products/products.repository');
      mockRepo.confirmAndDecrementStock.mockRejectedValue(
        new OutOfStockError('p1'),
      );

      await expect(service.markPaid('o1')).rejects.toThrow(OutOfStockError);
    });

    it('skips the email when no customer email is on the order (guest)', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          status: OrderStatus.PENDING,
          customerId: null,
        }),
      );
      mockRepo.confirmAndDecrementStock.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.CONFIRMED }),
      );
      mockRepo.findCustomerEmail.mockResolvedValue(null);

      await service.markPaid('o1');

      expect(mockEmailQueue.enqueueOrderConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('transitionStatus', () => {
    it('throws BadRequestException on an invalid transition', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.DELIVERED }),
      );

      await expect(
        service.transitionStatus('o1', OrderStatus.CONFIRMED, {
          id: 'admin',
          role: UserRole.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when a customer confirms their own order', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          status: OrderStatus.PENDING,
          customerId: 'user-1',
        }),
      );

      await expect(
        service.transitionStatus('o1', OrderStatus.CONFIRMED, {
          id: 'user-1',
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('allows a customer to cancel their own PENDING order', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          status: OrderStatus.PENDING,
          customerId: 'user-1',
        }),
      );
      mockRepo.updateStatus.mockResolvedValue(
        createMockOrder({ id: 'o1', status: OrderStatus.CANCELLED }),
      );

      await service.cancel('o1', { id: 'user-1', role: UserRole.CUSTOMER });

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'o1',
        OrderStatus.CANCELLED,
      );
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for a missing order', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.findById('missing', 'user-1', UserRole.CUSTOMER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a customer fetches another user order', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockOrder({ id: 'o1', customerId: 'someone-else' }),
      );

      await expect(
        service.findById('o1', 'user-1', UserRole.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the order for the owning customer', async () => {
      const order: OrderEntity = createMockOrder({
        id: 'o1',
        customerId: 'user-1',
      });
      mockRepo.findById.mockResolvedValue(order);

      await expect(
        service.findById('o1', 'user-1', UserRole.CUSTOMER),
      ).resolves.toBe(order);
    });
  });
});
