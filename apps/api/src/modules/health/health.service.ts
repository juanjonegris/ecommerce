import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

import { RedisProvider } from './redis.provider';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
  ) {}

  async checkDatabase(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        check: 'database',
        message: err instanceof Error ? err.message : 'database unreachable',
      });
    }
  }

  async checkRedis(): Promise<{ status: 'ok' }> {
    try {
      // ioredis types `ping()` as returning the literal 'PONG'; on failure it
      // throws, so we don't need to inspect the return value.
      await this.redis.client.ping();
      return { status: 'ok' };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        check: 'redis',
        message: err instanceof Error ? err.message : 'redis unreachable',
      });
    }
  }
}
