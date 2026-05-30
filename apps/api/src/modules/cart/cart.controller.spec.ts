import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';

import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { createMockCart } from '../../../test/factories/cart.factory';

import { CartController } from './cart.controller';
import type { CartService } from './cart.service';
import type { AddToCartDto } from './dto/add-to-cart.dto';
import type { MergeCartDto } from './dto/merge-cart.dto';

const mockService = {
  getCart: jest.fn(),
  addItem: jest.fn(),
  updateQuantity: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  merge: jest.fn(),
};

function makeRes(): { setHeader: jest.Mock } {
  return { setHeader: jest.fn() };
}

describe('CartController', () => {
  let controller: CartController;

  beforeEach(() => {
    controller = new CartController(mockService as unknown as CartService);
    jest.clearAllMocks();
    mockService.getCart.mockResolvedValue(createMockCart());
  });

  describe('getCart (guest)', () => {
    it('generates and echoes a session id when no header is sent', async () => {
      const res = makeRes();
      const result = await controller.getCart(
        undefined,
        undefined,
        res as unknown as Response,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Cart-Session',
        expect.any(String),
      );
      const echoed = res.setHeader.mock.calls[0]?.[1] as string;
      expect(result.sessionId).toBe(echoed);
      expect(mockService.getCart).toHaveBeenCalledWith({
        type: 'guest',
        id: echoed,
      });
    });

    it('echoes the provided session id', async () => {
      const res = makeRes();
      const result = await controller.getCart(
        undefined,
        'sess-1',
        res as unknown as Response,
      );

      expect(res.setHeader).toHaveBeenCalledWith('X-Cart-Session', 'sess-1');
      expect(result.sessionId).toBe('sess-1');
      expect(mockService.getCart).toHaveBeenCalledWith({
        type: 'guest',
        id: 'sess-1',
      });
    });
  });

  describe('getCart (authenticated)', () => {
    it('uses the user cart and does not set a session header', async () => {
      const res = makeRes();
      const user = { id: 'u1' } as UserEntity;

      const result = await controller.getCart(
        user,
        'sess-ignored',
        res as unknown as Response,
      );

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result.sessionId).toBeUndefined();
      expect(mockService.getCart).toHaveBeenCalledWith({
        type: 'user',
        id: 'u1',
      });
    });
  });

  describe('addItem', () => {
    it('delegates to service.addItem with the dto', async () => {
      const res = makeRes();
      const dto: AddToCartDto = { productId: 'p1', quantity: 2 };
      mockService.addItem.mockResolvedValue(createMockCart());

      await controller.addItem(
        dto,
        undefined,
        'sess-1',
        res as unknown as Response,
      );

      expect(mockService.addItem).toHaveBeenCalledWith(
        { type: 'guest', id: 'sess-1' },
        dto,
      );
    });
  });

  describe('merge', () => {
    it('delegates to service.merge with user and sessionId', async () => {
      const user = { id: 'u1' } as UserEntity;
      const dto: MergeCartDto = { sessionId: 'sess-1' };
      mockService.merge.mockResolvedValue(createMockCart());

      await controller.merge(user, dto);

      expect(mockService.merge).toHaveBeenCalledWith(user, 'sess-1');
    });
  });
});

describe('Cart auth guards', () => {
  it('JwtAuthGuard (on /cart/merge) rejects unauthenticated requests', () => {
    const guard = new JwtAuthGuard();
    expect(() => {
      guard.handleRequest(null, false, undefined, {} as ExecutionContext);
    }).toThrow(UnauthorizedException);
  });

  it('OptionalJwtAuthGuard falls through to guest when no user', () => {
    const guard = new OptionalJwtAuthGuard();
    expect(guard.handleRequest(null, false)).toBeUndefined();
  });
});
