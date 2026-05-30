import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @ApiPropertyOptional({
    description:
      'Optional shipping address. Validated but not persisted at MVP — the Order model has no address column.',
    example: '123 Main St, Springfield',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;
}
