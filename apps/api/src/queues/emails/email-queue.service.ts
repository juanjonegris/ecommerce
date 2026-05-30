import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';

import {
  EMAILS_QUEUE,
  type OrderConfirmationJob,
  type PasswordResetJob,
  type WelcomeJob,
} from './email-job.types';

/**
 * Typed producer for the `emails` queue. Callers (e.g. a future OrdersService)
 * inject this instead of touching the raw Queue, so job names and payloads stay
 * type-checked. Each enqueue stamps the current requestId from CLS into the job
 * data so the worker can correlate its logs with the originating request.
 */
@Injectable()
export class EmailQueue {
  constructor(
    @InjectQueue(EMAILS_QUEUE) private readonly queue: Queue,
    private readonly cls: ClsService,
  ) {}

  async enqueueOrderConfirmation(data: OrderConfirmationJob): Promise<void> {
    await this.queue.add('order-confirmation', this.withRequestId(data));
  }

  async enqueuePasswordReset(data: PasswordResetJob): Promise<void> {
    await this.queue.add('password-reset', this.withRequestId(data));
  }

  async enqueueWelcome(data: WelcomeJob): Promise<void> {
    await this.queue.add('welcome', this.withRequestId(data));
  }

  private withRequestId<T extends { requestId?: string }>(data: T): T {
    return { ...data, requestId: data.requestId ?? this.cls.getId() };
  }
}
