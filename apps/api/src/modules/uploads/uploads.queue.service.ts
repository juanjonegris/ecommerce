import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';

import {
  UPLOADS_QUEUE,
  type CleanupStaleUploadsJob,
} from './uploads-job.types';

const CLEANUP_JOB_NAME = 'cleanup-stale-uploads';
const CLEANUP_REPEATABLE_ID = 'cleanup-stale-uploads-cron';
const CLEANUP_CRON_HOURLY = '0 * * * *';

/**
 * Typed producer for the `uploads` queue. Stamps the current requestId from
 * CLS so workers can correlate logs with the originating HTTP request.
 */
@Injectable()
export class UploadsQueue {
  constructor(
    @InjectQueue(UPLOADS_QUEUE) private readonly queue: Queue,
    private readonly cls: ClsService,
  ) {}

  /**
   * Idempotently schedule the hourly cleanup job. BullMQ dedupes repeatable
   * jobs by name + jobId + pattern, so calling this on every module boot is
   * safe — no duplicate cron entries accumulate.
   */
  async scheduleCleanupRepeatable(): Promise<void> {
    await this.queue.add(CLEANUP_JOB_NAME, this.withRequestId({}), {
      jobId: CLEANUP_REPEATABLE_ID,
      repeat: { pattern: CLEANUP_CRON_HOURLY },
    });
  }

  /** Fire-and-forget single cleanup (used by tests / admin tooling). */
  async triggerCleanupOnce(): Promise<void> {
    await this.queue.add(CLEANUP_JOB_NAME, this.withRequestId({}));
  }

  private withRequestId(data: CleanupStaleUploadsJob): CleanupStaleUploadsJob {
    return { ...data, requestId: data.requestId ?? this.cls.getId() };
  }
}
