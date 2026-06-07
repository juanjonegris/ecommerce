import { randomUUID } from 'crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import { type PaymentProvider, PaymentStatusSchema } from '@repo/types';

import type {
  CreateIntentInput,
  CreateIntentResult,
  PaymentProviderAdapter,
  VerifiedWebhook,
} from './payment-provider.interface';

const STUB_SIGNATURE = 'stub';

/**
 * Dev-only PaymentProvider. Selected by PaymentsModule's useFactory when
 * STRIPE_SECRET_KEY is empty so `pnpm dev` runs without real keys.
 *
 * - createIntent returns deterministic stub ids.
 * - verifyWebhook trusts a sentinel `stripe-signature: stub` header and parses
 *   the rawBody as JSON with shape { eventId, type, providerPaymentId, status }.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProviderAdapter {
  readonly name: PaymentProvider = 'STRIPE';

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const requestId = this.cls.getId();
    const id = randomUUID();
    this.logger.log({
      message: 'payment.provider.stub.create_intent_succeeded',
      requestId,
      orderId: input.orderId,
      amount: input.amount,
    });
    return Promise.resolve({
      providerPaymentId: `pi_stub_${id}`,
      clientSecret: `cs_stub_${id}`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<VerifiedWebhook | null> {
    const requestId = this.cls.getId();
    if (signatureHeader !== STUB_SIGNATURE) {
      this.logger.warn({
        message: 'payment.provider.stub.verify_webhook_failed',
        requestId,
        reason: 'invalid signature',
      });
      throw new BadRequestException('Invalid stub signature');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid stub webhook payload');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadRequestException('Invalid stub webhook payload');
    }
    const obj = parsed as Record<string, unknown>;
    const { eventId, type, providerPaymentId, status } = obj;
    if (
      typeof eventId !== 'string' ||
      typeof type !== 'string' ||
      typeof providerPaymentId !== 'string' ||
      typeof status !== 'string'
    ) {
      throw new BadRequestException('Invalid stub webhook payload');
    }
    const parsedStatus = PaymentStatusSchema.safeParse(status);
    if (!parsedStatus.success) {
      throw new BadRequestException('Invalid stub webhook status');
    }

    const result: VerifiedWebhook = {
      eventId,
      type,
      providerPaymentId,
      status: parsedStatus.data,
    };
    if (typeof obj.failureReason === 'string') {
      result.failureReason = obj.failureReason;
    }
    return result;
  }
}
