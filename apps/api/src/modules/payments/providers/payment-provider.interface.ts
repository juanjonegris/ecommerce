import type { PaymentProvider, PaymentStatus } from '@repo/types';

/** Input handed to a provider to start a new charge attempt for an Order. */
export interface CreateIntentInput {
  orderId: string;
  /** Decimal amount in major units (e.g. 12.50 — providers convert to minor units). */
  amount: number;
  /** ISO 4217, lowercase (e.g. "usd"). */
  currency: string;
  customerEmail?: string;
  /** Optional provider-side metadata (always merged with orderId). */
  metadata?: Record<string, string>;
}

/** Returned from createIntent; the clientSecret is what the FE confirms with. */
export interface CreateIntentResult {
  providerPaymentId: string;
  clientSecret: string;
}

/**
 * Provider-agnostic shape of a verified webhook event. `null` returned from
 * `verifyWebhook` means the event was authentic but not interesting to us
 * (e.g. `customer.updated`) — the handler should ack 200 and do nothing.
 */
export interface VerifiedWebhook {
  eventId: string;
  type: string;
  providerPaymentId: string;
  status: PaymentStatus;
  amountReceived?: number;
  failureReason?: string;
}

/**
 * Payment-provider port. Swap implementations (Stripe, MercadoPago, …) by
 * binding a different class to PAYMENT_PROVIDER in PaymentsModule — no caller
 * changes required.
 */
export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  verifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<VerifiedWebhook | null>;
}

/** DI token for the PaymentProviderAdapter interface. */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
