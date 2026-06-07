import { z } from 'zod';

export const PaymentStatusSchema = z.enum([
  'REQUIRES_PAYMENT_METHOD',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentProviderSchema = z.enum(['STRIPE', 'MERCADO_PAGO']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export interface Payment {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  clientSecret: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  provider: PaymentProviderSchema,
  providerPaymentId: z.string(),
  status: PaymentStatusSchema,
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  clientSecret: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
