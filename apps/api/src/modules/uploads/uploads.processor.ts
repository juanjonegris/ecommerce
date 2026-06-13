import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, LoggerService } from '@nestjs/common';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { UPLOADS_QUEUE, type UploadsJobData } from './uploads-job.types';
import { UploadsService } from './uploads.service';

/**
 * Consumes the `uploads` queue. Only one job kind today: the hourly
 * `cleanup-stale-uploads` cron that resolves abandoned PENDING_UPLOAD rows.
 */
@Processor(UPLOADS_QUEUE)
export class UploadsProcessor extends WorkerHost {
  constructor(
    private readonly service: UploadsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<UploadsJobData>): Promise<void> {
    const requestId = job.data.requestId ?? job.id ?? 'unknown';
    this.logger.log({
      message: 'uploads.processor.process_started',
      requestId,
      jobId: job.id,
      jobName: job.name,
    });

    try {
      if (job.name === 'cleanup-stale-uploads') {
        await this.service.cleanupStaleUploads();
      } else {
        throw new Error(`Unknown uploads job: ${job.name}`);
      }
      this.logger.log({
        message: 'uploads.processor.process_succeeded',
        requestId,
        jobId: job.id,
        jobName: job.name,
      });
    } catch (err) {
      const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(
        {
          message: isFinal
            ? 'uploads.processor.process_failed_terminal'
            : 'uploads.processor.process_failed',
          requestId,
          jobId: job.id,
          jobName: job.name,
          attempt: job.attemptsMade + 1,
          error: err instanceof Error ? err.message : String(err),
        },
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}
