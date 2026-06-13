import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';

import {
  NEWSLETTER_QUEUE,
  type UnsubscribeJob,
  type UpsertSubscriberJob,
} from './newsletter-job.types';

/**
 * Typed producer for the `newsletter` queue. Mirrors the EmailQueue pattern:
 * callers inject this instead of touching the raw Queue, so job names and
 * payloads stay type-checked. Stamps the current requestId from CLS so the
 * worker can correlate its logs with the originating request.
 */
@Injectable()
export class NewsletterQueue {
  constructor(
    @InjectQueue(NEWSLETTER_QUEUE) private readonly queue: Queue,
    private readonly cls: ClsService,
  ) {}

  async enqueueUpsert(data: UpsertSubscriberJob): Promise<void> {
    await this.queue.add('upsert-subscriber', this.withRequestId(data));
  }

  async enqueueUnsubscribe(data: UnsubscribeJob): Promise<void> {
    await this.queue.add('unsubscribe', this.withRequestId(data));
  }

  private withRequestId<T extends { requestId?: string }>(data: T): T {
    return { ...data, requestId: data.requestId ?? this.cls.getId() };
  }
}
