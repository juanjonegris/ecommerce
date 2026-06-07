import { PaymentEntity } from '@/modules/payments/entities/payment.entity';

let counter = 0;

export function createMockPayment(
  overrides: Partial<PaymentEntity> = {},
): PaymentEntity {
  const n = ++counter;
  const payment = new PaymentEntity();
  payment.id = `payment-${String(n)}`;
  payment.orderId = `order-${String(n)}`;
  payment.provider = 'STRIPE';
  payment.providerPaymentId = `pi_${String(n)}`;
  payment.status = 'REQUIRES_PAYMENT_METHOD';
  payment.amount = 25;
  payment.currency = 'usd';
  payment.clientSecret = `cs_${String(n)}`;
  payment.failureReason = null;
  payment.createdAt = new Date('2026-01-01');
  payment.updatedAt = new Date('2026-01-01');
  return Object.assign(payment, overrides);
}
