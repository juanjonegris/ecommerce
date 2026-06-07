import { ApiProperty } from '@nestjs/swagger';

import type { PaymentEntity } from '../entities/payment.entity';

/**
 * Response from POST /payments/intent. The clientSecret here is the only place
 * it is exposed — once consumed by the FE, subsequent reads (GET /payments/:id)
 * omit it.
 */
export class CreateIntentResponseDto {
  @ApiProperty({ example: 'clpay000000000000000000000' })
  paymentId!: string;

  @ApiProperty({ example: 'pi_3Nz...' })
  providerPaymentId!: string;

  @ApiProperty({ example: 'pi_3Nz..._secret_...' })
  clientSecret!: string;

  static from(payment: PaymentEntity): CreateIntentResponseDto {
    const dto = new CreateIntentResponseDto();
    dto.paymentId = payment.id;
    dto.providerPaymentId = payment.providerPaymentId;
    dto.clientSecret = payment.clientSecret ?? '';
    return dto;
  }
}
