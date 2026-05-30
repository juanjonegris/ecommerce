import { Injectable } from '@nestjs/common';

import type { Cart } from '@repo/types';

import { RedisProvider } from '@/modules/health/redis.provider';

@Injectable()
export class CartRepository {
  constructor(private readonly provider: RedisProvider) {}

  buildKey(type: 'guest' | 'user', id: string): string {
    return `cart:${type}:${id}`;
  }

  async getCart(key: string): Promise<Cart | null> {
    const raw = await this.provider.client.get(key);
    return raw ? (JSON.parse(raw) as Cart) : null;
  }

  async setCart(key: string, cart: Cart, ttlSeconds: number): Promise<void> {
    await this.provider.client.set(key, JSON.stringify(cart), 'EX', ttlSeconds);
  }

  async deleteCart(key: string): Promise<void> {
    await this.provider.client.del(key);
  }
}
