import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';
import Stripe from 'stripe';

import type { PaymentProvider, PaymentStatus } from '@repo/types';

import type { AppConfig } from '@/config/configuration';

import type {
  CreateIntentInput,
  CreateIntentResult,
  PaymentProviderAdapter,
  VerifiedWebhook,
} from './payment-provider.interface';

const STRIPE_API_VERSION = '2024-06-20';

// The stripe@22 CJS type entry only re-exports the callable constructor, not
// the merged Stripe.* namespace. We use Stripe.Stripe (the type alias the entry
// does expose) for the client field, and define narrow structural types for
// the Stripe response surfaces we actually touch — keeps this wrapper small
// and unit-testable without leaking the entire Stripe SDK into our code.
type StripeClient = Stripe.Stripe;

interface StripePaymentIntent {
  id: string;
  amount: number;
  amount_received?: number;
  client_secret: string | null;
  last_payment_error?: { message?: string };
}

interface StripeCharge {
  payment_intent: string | { id: string } | null;
}

interface StripeEventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

/**
 * Real Stripe-backed PaymentProvider. Selected by PaymentsModule's useFactory
 * when STRIPE_SECRET_KEY is non-empty; otherwise StubPaymentProvider is used.
 */
@Injectable()
export class StripeProvider implements PaymentProviderAdapter {
  readonly name: PaymentProvider = 'STRIPE';
  private readonly stripe: StripeClient;
  private readonly webhookSecret: string;

  constructor(
    config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {
    const secretKey =
      config.get<AppConfig['STRIPE_SECRET_KEY']>('STRIPE_SECRET_KEY') ?? '';
    if (!secretKey) {
      // Unreachable in normal boot — the module factory binds the stub when the
      // key is empty. Throwing here surfaces the contradiction loudly if forced.
      throw new Error('StripeProvider requires STRIPE_SECRET_KEY');
    }
    // The apiVersion option is typed against a string-literal union we don't
    // have access to here; passing the version as a const is safe at runtime
    // and Stripe validates it server-side.
    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    } as unknown as Stripe.Stripe extends never
      ? never
      : ConstructorParameters<typeof Stripe>[1]);
    this.webhookSecret =
      config.get<AppConfig['STRIPE_WEBHOOK_SECRET']>('STRIPE_WEBHOOK_SECRET') ??
      '';
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'payment.provider.stripe.create_intent_started',
      requestId,
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency,
    });

    try {
      const metadata: Record<string, string> = {
        orderId: input.orderId,
        ...(input.metadata ?? {}),
      };
      const params = {
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        automatic_payment_methods: { enabled: true },
        metadata,
        ...(input.customerEmail !== undefined
          ? { receipt_email: input.customerEmail }
          : {}),
      };
      const intent = (await this.stripe.paymentIntents.create(
        params,
      )) as StripePaymentIntent;

      this.logger.log({
        message: 'payment.provider.stripe.create_intent_succeeded',
        requestId,
        providerPaymentId: intent.id,
      });

      return {
        providerPaymentId: intent.id,
        clientSecret: intent.client_secret ?? '',
      };
    } catch (err) {
      this.logger.error({
        message: 'payment.provider.stripe.create_intent_failed',
        requestId,
        orderId: input.orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<VerifiedWebhook | null> {
    const requestId = this.cls.getId();
    if (!this.webhookSecret) {
      this.logger.error({
        message: 'payment.provider.stripe.verify_webhook_failed',
        requestId,
        error: 'STRIPE_WEBHOOK_SECRET not configured',
      });
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: StripeEventLike;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        this.webhookSecret,
      ) as unknown as StripeEventLike;
    } catch (err) {
      this.logger.warn({
        message: 'payment.provider.stripe.verify_webhook_failed',
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new BadRequestException('Invalid Stripe signature');
    }

    this.logger.log({
      message: 'payment.provider.stripe.verify_webhook_succeeded',
      requestId,
      eventId: event.id,
      type: event.type,
    });

    return this.mapEvent(event);
  }

  private mapEvent(event: StripeEventLike): VerifiedWebhook | null {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as StripePaymentIntent;
        return {
          eventId: event.id,
          type: event.type,
          providerPaymentId: pi.id,
          status: 'SUCCEEDED' satisfies PaymentStatus,
          amountReceived: (pi.amount_received ?? pi.amount) / 100,
        };
      }
      case 'payment_intent.processing': {
        const pi = event.data.object as StripePaymentIntent;
        return {
          eventId: event.id,
          type: event.type,
          providerPaymentId: pi.id,
          status: 'PROCESSING' satisfies PaymentStatus,
        };
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as StripePaymentIntent;
        const failure: VerifiedWebhook = {
          eventId: event.id,
          type: event.type,
          providerPaymentId: pi.id,
          status: 'FAILED' satisfies PaymentStatus,
        };
        const reason = pi.last_payment_error?.message;
        if (reason !== undefined) failure.failureReason = reason;
        return failure;
      }
      case 'payment_intent.canceled': {
        const pi = event.data.object as StripePaymentIntent;
        return {
          eventId: event.id,
          type: event.type,
          providerPaymentId: pi.id,
          status: 'CANCELLED' satisfies PaymentStatus,
        };
      }
      case 'charge.refunded': {
        const charge = event.data.object as StripeCharge;
        const providerPaymentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? '');
        if (!providerPaymentId) return null;
        return {
          eventId: event.id,
          type: event.type,
          providerPaymentId,
          status: 'REFUNDED' satisfies PaymentStatus,
        };
      }
      default:
        return null;
    }
  }
}
