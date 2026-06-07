import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PaymentProvider as PrismaPaymentProvider } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

/**
 * Idempotency log for provider webhook deliveries. Stripe (and others) retry on
 * 5xx and timeouts — recording the (provider, eventId) pair lets the handler
 * detect duplicates and ack 200 without re-processing.
 */
@Injectable()
export class WebhookEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @returns true if the event was newly recorded; false if it was a duplicate.
   */
  async recordEvent(
    provider: PrismaPaymentProvider,
    eventId: string,
    type: string,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { provider, eventId, type },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }
}
