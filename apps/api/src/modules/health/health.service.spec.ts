import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '@/prisma/prisma.service';

import { HealthService } from './health.service';
import type { RedisProvider } from './redis.provider';

describe('HealthService', () => {
  let service: HealthService;
  const prisma = { $queryRaw: jest.fn() };
  const redis = { client: { ping: jest.fn() } };

  beforeEach(() => {
    service = new HealthService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisProvider,
    );
    jest.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('returns ok when SELECT 1 succeeds', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      await expect(service.checkDatabase()).resolves.toEqual({ status: 'ok' });
    });

    it('throws ServiceUnavailableException when query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      await expect(service.checkDatabase()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('checkRedis', () => {
    it('returns ok when ping succeeds', async () => {
      redis.client.ping.mockResolvedValue('PONG');
      await expect(service.checkRedis()).resolves.toEqual({ status: 'ok' });
    });

    it('throws ServiceUnavailableException when ping rejects', async () => {
      redis.client.ping.mockRejectedValue(new Error('redis down'));
      await expect(service.checkRedis()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
