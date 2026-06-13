import { ApiProperty } from '@nestjs/swagger';

export type ConfirmResult = 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'INVALID_TOKEN';

export class ConfirmResponseDto {
  @ApiProperty({
    enum: ['CONFIRMED', 'ALREADY_CONFIRMED', 'INVALID_TOKEN'],
    example: 'CONFIRMED',
  })
  status!: ConfirmResult;
}
