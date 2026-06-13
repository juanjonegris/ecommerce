import { ApiProperty } from '@nestjs/swagger';

/**
 * Anti-enumeration response shape (plan D3). Every call to `/subscribe` and
 * `/unsubscribe` returns this literal regardless of underlying state — we
 * never reveal whether an email was new, already pending, already confirmed,
 * or unknown.
 */
export class SubscribeResponseDto {
  @ApiProperty({ enum: ['ACCEPTED'], example: 'ACCEPTED' })
  status!: 'ACCEPTED';

  @ApiProperty({
    example: 'If your email is eligible, you will receive an email shortly.',
  })
  message!: string;
}

export const ACCEPTED_RESPONSE: SubscribeResponseDto = {
  status: 'ACCEPTED',
  message: 'If your email is eligible, you will receive an email shortly.',
};
