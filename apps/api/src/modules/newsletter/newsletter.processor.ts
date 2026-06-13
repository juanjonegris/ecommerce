import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import type { AppConfig } from '@/config/configuration';

import {
  NEWSLETTER_QUEUE,
  type NewsletterJobData,
  type UnsubscribeJob,
  type UpsertSubscriberJob,
} from './newsletter-job.types';
import { NewsletterRepository } from './newsletter.repository';
import {
  NEWSLETTER_PROVIDER,
  type NewsletterProviderAdapter,
} from './providers/newsletter-provider.interface';

/**
 * Consumes the `newsletter` queue and pushes subscriber state to the bound
 * provider. Throws on failure so BullMQ applies the queue's retry/backoff
 * policy; on the final attempt the row's syncState flips to FAILED.
 */
@Processor(NEWSLETTER_QUEUE)
export class NewsletterProcessor extends WorkerHost {
  constructor(
    @Inject(NEWSLETTER_PROVIDER)
    private readonly provider: NewsletterProviderAdapter,
    private readonly repository: NewsletterRepository,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<NewsletterJobData>): Promise<void> {
    const requestId = job.data.requestId ?? job.id ?? 'unknown';
    this.logger.log({
      message: 'newsletter.processor.process_started',
      requestId,
      jobId: job.id,
      jobName: job.name,
    });

    try {
      if (job.name === 'upsert-subscriber') {
        await this.processUpsert(job as Job<UpsertSubscriberJob>, requestId);
      } else if (job.name === 'unsubscribe') {
        await this.processUnsubscribe(job as Job<UnsubscribeJob>, requestId);
      } else {
        throw new Error(`Unknown newsletter job: ${job.name}`);
      }
      this.logger.log({
        message: 'newsletter.processor.process_succeeded',
        requestId,
        jobId: job.id,
        jobName: job.name,
      });
    } catch (err) {
      this.logger.error(
        {
          message: 'newsletter.processor.process_failed',
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

  private async processUpsert(
    job: Job<UpsertSubscriberJob>,
    requestId: string,
  ): Promise<void> {
    const sub = await this.repository.findById(job.data.subscriberId);
    if (!sub) {
      // Subscriber was admin-deleted between enqueue and dispatch — skip silently.
      this.logger.warn({
        message: 'newsletter.processor.upsert_skipped_missing_row',
        requestId,
        subscriberId: job.data.subscriberId,
      });
      return;
    }

    const doubleOptIn =
      this.config.get<AppConfig['NEWSLETTER_DOUBLE_OPT_IN']>(
        'NEWSLETTER_DOUBLE_OPT_IN',
      ) ?? true;

    try {
      const result = await this.provider.upsertSubscriber({
        email: sub.email,
        ...(sub.tags.length > 0 ? { tags: sub.tags } : {}),
        ...(sub.locale !== null ? { locale: sub.locale } : {}),
        doubleOptIn,
      });
      await this.repository.update(sub.id, {
        providerSubscriberId: result.providerSubscriberId,
        provider: this.provider.name,
        syncState: 'SYNCED',
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.repository.update(sub.id, {
        lastSyncError: message,
        ...(isFinal ? { syncState: 'FAILED' as const } : {}),
      });
      throw err;
    }
  }

  private async processUnsubscribe(
    job: Job<UnsubscribeJob>,
    requestId: string,
  ): Promise<void> {
    try {
      await this.provider.unsubscribe(job.data.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 404-like responses are acceptable — the upstream may not know the email.
      const lower = message.toLowerCase();
      if (message.includes('404') || lower.includes('not found')) {
        this.logger.warn({
          message: 'newsletter.processor.unsubscribe_swallowed_404',
          requestId,
          email: job.data.email,
        });
        return;
      }
      throw err;
    }
  }
}
