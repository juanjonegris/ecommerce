import type { LoggerService } from '@nestjs/common';
import type { Job } from 'bullmq';

import type { UploadsJobData } from './uploads-job.types';
import { UploadsProcessor } from './uploads.processor';
import type { UploadsService } from './uploads.service';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeService(): jest.Mocked<
  Pick<UploadsService, 'cleanupStaleUploads'>
> {
  return { cleanupStaleUploads: jest.fn() };
}

function makeJob(
  overrides: Partial<Job<UploadsJobData>> = {},
): Job<UploadsJobData> {
  return {
    id: 'job-1',
    name: 'cleanup-stale-uploads',
    data: { requestId: 'req-id' },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as unknown as Job<UploadsJobData>;
}

describe('UploadsProcessor', () => {
  let service: ReturnType<typeof makeService>;
  let processor: UploadsProcessor;

  beforeEach(() => {
    service = makeService();
    processor = new UploadsProcessor(
      service as unknown as UploadsService,
      mockLogger as unknown as LoggerService,
    );
    jest.clearAllMocks();
  });

  it('cleanup-stale-uploads delegates to service.cleanupStaleUploads', async () => {
    service.cleanupStaleUploads.mockResolvedValue({
      confirmed: 1,
      removed: 2,
    });
    await processor.process(makeJob());
    expect(service.cleanupStaleUploads).toHaveBeenCalled();
  });

  it('final attempt failure logs _failed_terminal', async () => {
    service.cleanupStaleUploads.mockRejectedValue(new Error('boom'));
    await expect(
      processor.process(makeJob({ attemptsMade: 2, opts: { attempts: 3 } })),
    ).rejects.toThrow(/boom/);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'uploads.processor.process_failed_terminal',
      }),
      expect.anything(),
    );
  });

  it('unknown job name throws', async () => {
    await expect(
      processor.process(makeJob({ name: 'mystery-job' })),
    ).rejects.toThrow(/Unknown uploads job/);
  });
});
