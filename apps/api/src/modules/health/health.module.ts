import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisProvider } from './redis.provider';

@Module({
  controllers: [HealthController],
  providers: [HealthService, RedisProvider],
  exports: [RedisProvider],
})
export class HealthModule {}
