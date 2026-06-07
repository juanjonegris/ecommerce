import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { PaymentProvider, PaymentStatus } from '@repo/types';

import type { PaymentEntity } from '../entities/payment.entity';

/**
 * Generic payment view. Does NOT include clientSecret — that is sensitive once
 * consumed and only returned by CreateIntentResponseDto on the createIntent call.
 */
export class PaymentResponseDto {
  @ApiProperty({ example: 'clpay000000000000000000000' })
  id!: string;

  @ApiProperty({ example: 'clorder000000000000000000' })
  orderId!: string;

  @ApiProperty({ enum: ['STRIPE', 'MERCADO_PAGO'], example: 'STRIPE' })
  provider!: PaymentProvider;

  @ApiProperty({ example: 'pi_3Nz...' })
  providerPaymentId!: string;

  @ApiProperty({
    enum: [
      'REQUIRES_PAYMENT_METHOD',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
    ],
    example: 'SUCCEEDED',
  })
  status!: PaymentStatus;

  @ApiProperty({ example: 79.99 })
  amount!: number;

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiPropertyOptional({ example: 'Card declined', nullable: true })
  failureReason!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: PaymentEntity): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    dto.id = entity.id;
    dto.orderId = entity.orderId;
    dto.provider = entity.provider;
    dto.providerPaymentId = entity.providerPaymentId;
    dto.status = entity.status;
    dto.amount = entity.amount;
    dto.currency = entity.currency;
    dto.failureReason = entity.failureReason;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
