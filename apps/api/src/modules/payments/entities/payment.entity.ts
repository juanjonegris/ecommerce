import type { Payment, PaymentProvider, PaymentStatus } from '@repo/types';

export class PaymentEntity implements Payment {
  id!: string;
  orderId!: string;
  provider!: PaymentProvider;
  providerPaymentId!: string;
  status!: PaymentStatus;
  amount!: number;
  currency!: string;
  clientSecret!: string | null;
  failureReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
