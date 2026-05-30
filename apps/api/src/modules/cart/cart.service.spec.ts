import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { ProductEntity } from '@/modules/products/entities/product.entity';
import type { ProductsRepository } from '@/modules/products/products.repository';

import {
  createMockCart,
  createMockCartItem,
} from '../../../test/factories/cart.factory';
import { createMockProduct } from '../../../test/factories/product.factory';

import type { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import type { CartIdentity } from './cart.service';
import type { AddToCartDto } from './dto/add-to-cart.dto';

const mockCartRepo: jest.Mocked<
  Pick<CartRepository, 'buildKey' | 'getCart' | 'setCart' | 'deleteCart'>
> = {
  buildKey: jest.fn(),
  getCart: jest.fn(),
  setCart: jest.fn(),
  deleteCart: jest.fn(),
};

const mockProductsRepo: jest.Mocked<Pick<ProductsRepository, 'findById'>> = {
  findById: jest.fn(),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

const guest: CartIdentity = { type: 'guest', id: 'sess-1' };

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    service = new CartService(
      mockCartRepo as unknown as CartRepository,
      mockProductsRepo as unknown as ProductsRepository,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
    mockCartRepo.buildKey.mockImplementation(
      (type: 'guest' | 'user', id: string) => `cart:${type}:${id}`,
    );
  });

  describe('addItem', () => {
    const dto: AddToCartDto = { productId: 'p1', quantity: 2 };

    it('creates a new cart when none exists', async () => {
      const product = createMockProduct({
        id: 'p1',
        name: 'Widget',
        slug: 'widget',
        price: 9.99,
        isActive: true,
      });
      mockProductsRepo.findById.mockResolvedValue(
        product as unknown as ProductEntity,
      );
      mockCartRepo.getCart.mockResolvedValue(null);

      const result = await service.addItem(guest, dto);

      expect(mockCartRepo.setCart).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([
        {
          productId: 'p1',
          name: 'Widget',
          slug: 'widget',
          price: 9.99,
          quantity: 2,
        },
      ]);
    });

    it('increments quantity when item already present', async () => {
      const product = createMockProduct({ id: 'p1', isActive: true });
      mockProductsRepo.findById.mockResolvedValue(
        product as unknown as ProductEntity,
      );
      mockCartRepo.getCart.mockResolvedValue(
        createMockCart({
          items: [createMockCartItem({ productId: 'p1', quantity: 2 })],
        }),
      );

      // existing quantity 2 + dto quantity 2
      const result = await service.addItem(guest, dto);

      expect(result.items[0]?.quantity).toBe(4);
    });

    it('throws NotFoundException for unknown product', async () => {
      mockProductsRepo.findById.mockResolvedValue(null);

      await expect(service.addItem(guest, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockCartRepo.setCart).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for inactive product', async () => {
      const product = createMockProduct({ id: 'p1', isActive: false });
      mockProductsRepo.findById.mockResolvedValue(
        product as unknown as ProductEntity,
      );

      await expect(service.addItem(guest, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCartRepo.setCart).not.toHaveBeenCalled();
    });
  });

  describe('updateQuantity', () => {
    it('throws BadRequestException for quantity < 1', async () => {
      await expect(service.updateQuantity(guest, 'p1', 0)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCartRepo.getCart).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when item not in cart', async () => {
      mockCartRepo.getCart.mockResolvedValue(createMockCart({ items: [] }));

      await expect(service.updateQuantity(guest, 'missing', 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets the exact quantity when item exists', async () => {
      mockCartRepo.getCart.mockResolvedValue(
        createMockCart({
          items: [createMockCartItem({ productId: 'p1', quantity: 1 })],
        }),
      );

      const result = await service.updateQuantity(guest, 'p1', 7);

      expect(result.items[0]?.quantity).toBe(7);
      expect(mockCartRepo.setCart).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when item not in cart', async () => {
      mockCartRepo.getCart.mockResolvedValue(createMockCart({ items: [] }));

      await expect(service.removeItem(guest, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('merge', () => {
    it('sums quantities on conflict and deletes the guest cart', async () => {
      const user = { id: 'u1' } as UserEntity;
      const guestCart = createMockCart({
        items: [createMockCartItem({ productId: 'p1', quantity: 2 })],
      });
      const userCart = createMockCart({
        items: [
          createMockCartItem({ productId: 'p1', quantity: 1 }),
          createMockCartItem({ productId: 'p2', quantity: 5 }),
        ],
      });
      // First getCart → guest, second → user.
      mockCartRepo.getCart
        .mockResolvedValueOnce(guestCart)
        .mockResolvedValueOnce(userCart);

      const result = await service.merge(user, 'sess-1');

      const p1 = result.items.find((i) => i.productId === 'p1');
      const p2 = result.items.find((i) => i.productId === 'p2');
      expect(p1?.quantity).toBe(3);
      expect(p2?.quantity).toBe(5);
      expect(mockCartRepo.setCart).toHaveBeenCalledWith(
        'cart:user:u1',
        expect.objectContaining({ items: expect.any(Array) }),
        expect.any(Number),
      );
      expect(mockCartRepo.deleteCart).toHaveBeenCalledWith('cart:guest:sess-1');
    });
  });
});
