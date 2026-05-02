import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const mockService = {
    checkDatabase: jest.fn().mockResolvedValue({ status: 'ok' }),
    checkRedis: jest.fn().mockResolvedValue({ status: 'ok' }),
  };

  beforeEach(() => {
    controller = new HealthController(mockService as unknown as HealthService);
    jest.clearAllMocks();
  });

  it('liveness returns { status: ok }', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('database delegates to HealthService', async () => {
    await expect(controller.database()).resolves.toEqual({ status: 'ok' });
    expect(mockService.checkDatabase).toHaveBeenCalledTimes(1);
  });

  it('redis delegates to HealthService', async () => {
    await expect(controller.redis()).resolves.toEqual({ status: 'ok' });
    expect(mockService.checkRedis).toHaveBeenCalledTimes(1);
  });
});
