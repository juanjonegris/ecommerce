import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { CartService } from '@/modules/cart/cart.service';
import type { ProductEntity } from '@/modules/products/entities/product.entity';
import type { ProductsRepository } from '@/modules/products/products.repository';
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
  Pick<OrdersRepository, 'create' | 'findAll' | 'findById' | 'updateStatus'>
> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
};

const mockProductsRepo: jest.Mocked<Pick<ProductsRepository, 'findById'>> = {
  findById: jest.fn(),
};

const mockCart: jest.Mocked<Pick<CartService, 'getCart' | 'clear'>> = {
  getCart: jest.fn(),
  clear: jest.fn(),
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
      mockEmailQueue as unknown as EmailQueue,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
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

    it('creates the order, clears the cart, and enqueues the email', async () => {
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
        expect.objectContaining({ customerId: 'user-1', total: 25 }),
      );
      expect(mockCart.clear).toHaveBeenCalledWith({
        type: 'user',
        id: 'user-1',
      });
      expect(mockEmailQueue.enqueueOrderConfirmation).toHaveBeenCalledWith({
        to: 'buyer@example.com',
        orderId: 'o1',
        total: 25,
      });
      expect(result).toBe(created);
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
