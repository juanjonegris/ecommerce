import {
  BadRequestException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { Cart } from '@repo/types';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { ProductsRepository } from '@/modules/products/products.repository';

import { CartRepository } from './cart.repository';
import type { AddToCartDto } from './dto/add-to-cart.dto';

export interface CartIdentity {
  type: 'guest' | 'user';
  id: string;
}

const GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;
const USER_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly products: ProductsRepository,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async getCart(identity: CartIdentity): Promise<Cart> {
    const cart = await this.repository.getCart(this.keyFor(identity));
    return cart ?? { items: [] };
  }

  async addItem(identity: CartIdentity, dto: AddToCartDto): Promise<Cart> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'cart.service.add_item_started',
      requestId,
      cartType: identity.type,
      productId: dto.productId,
    });

    const product = await this.products.findById(dto.productId);
    if (!product)
      throw new NotFoundException(`Product "${dto.productId}" not found`);
    if (!product.isActive)
      throw new BadRequestException('Product is not available');

    const key = this.keyFor(identity);
    const cart = (await this.repository.getCart(key)) ?? { items: [] };

    const existing = cart.items.find((i) => i.productId === dto.productId);
    if (existing) {
      existing.quantity += dto.quantity;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        quantity: dto.quantity,
      });
    }

    await this.repository.setCart(key, cart, this.ttlFor(identity));

    this.logger.log({
      message: 'cart.service.add_item_succeeded',
      requestId,
      cartType: identity.type,
      productId: dto.productId,
    });
    return cart;
  }

  async updateQuantity(
    identity: CartIdentity,
    productId: string,
    quantity: number,
  ): Promise<Cart> {
    if (quantity < 1)
      throw new BadRequestException('Quantity must be at least 1');

    const requestId = this.cls.getId();
    this.logger.log({
      message: 'cart.service.update_quantity_started',
      requestId,
      cartType: identity.type,
      productId,
    });

    const key = this.keyFor(identity);
    const cart = (await this.repository.getCart(key)) ?? { items: [] };
    const item = cart.items.find((i) => i.productId === productId);
    if (!item) throw new NotFoundException(`Item "${productId}" not in cart`);

    item.quantity = quantity;
    await this.repository.setCart(key, cart, this.ttlFor(identity));

    this.logger.log({
      message: 'cart.service.update_quantity_succeeded',
      requestId,
      cartType: identity.type,
      productId,
    });
    return cart;
  }

  async removeItem(identity: CartIdentity, productId: string): Promise<Cart> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'cart.service.remove_item_started',
      requestId,
      cartType: identity.type,
      productId,
    });

    const key = this.keyFor(identity);
    const cart = (await this.repository.getCart(key)) ?? { items: [] };
    const exists = cart.items.some((i) => i.productId === productId);
    if (!exists) throw new NotFoundException(`Item "${productId}" not in cart`);

    cart.items = cart.items.filter((i) => i.productId !== productId);
    await this.repository.setCart(key, cart, this.ttlFor(identity));

    this.logger.log({
      message: 'cart.service.remove_item_succeeded',
      requestId,
      cartType: identity.type,
      productId,
    });
    return cart;
  }

  async clear(identity: CartIdentity): Promise<Cart> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'cart.service.clear_started',
      requestId,
      cartType: identity.type,
    });

    await this.repository.deleteCart(this.keyFor(identity));

    this.logger.log({
      message: 'cart.service.clear_succeeded',
      requestId,
      cartType: identity.type,
    });
    return { items: [] };
  }

  async merge(user: UserEntity, sessionId: string): Promise<Cart> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'cart.service.merge_started',
      requestId,
      userId: user.id,
      sessionId,
    });

    const userKey = this.repository.buildKey('user', user.id);
    const guestKey = this.repository.buildKey('guest', sessionId);

    const guestCart = (await this.repository.getCart(guestKey)) ?? {
      items: [],
    };
    const userCart = (await this.repository.getCart(userKey)) ?? { items: [] };

    for (const guestItem of guestCart.items) {
      const match = userCart.items.find(
        (i) => i.productId === guestItem.productId,
      );
      if (match) {
        match.quantity += guestItem.quantity;
      } else {
        userCart.items.push(guestItem);
      }
    }

    await this.repository.setCart(userKey, userCart, USER_TTL_SECONDS);
    await this.repository.deleteCart(guestKey);

    this.logger.log({
      message: 'cart.service.merge_succeeded',
      requestId,
      userId: user.id,
      mergedItems: guestCart.items.length,
      totalItems: userCart.items.length,
    });
    return userCart;
  }

  private keyFor(identity: CartIdentity): string {
    return this.repository.buildKey(identity.type, identity.id);
  }

  private ttlFor(identity: CartIdentity): number {
    return identity.type === 'guest' ? GUEST_TTL_SECONDS : USER_TTL_SECONDS;
  }
}
