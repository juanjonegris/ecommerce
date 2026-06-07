import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateIntentDto {
  @ApiProperty({
    example: 'clorder000000000000000000',
    description: 'The PENDING order this payment intent will charge.',
  })
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
