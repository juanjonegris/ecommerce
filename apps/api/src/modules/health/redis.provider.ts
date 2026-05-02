import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { AppConfig } from '@/config/configuration';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisProvider implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    const url = config.get<AppConfig['REDIS_URL']>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
