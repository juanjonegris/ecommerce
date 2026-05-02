import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('db')
  database(): Promise<{ status: 'ok' }> {
    return this.health.checkDatabase();
  }

  @Get('redis')
  redis(): Promise<{ status: 'ok' }> {
    return this.health.checkRedis();
  }
}
