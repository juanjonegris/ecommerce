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

  @ApiPropertyOptional({
    description:
      'Optional discount code applied to the cart subtotal. Resolved + redeemed atomically inside the order create transaction.',
    example: 'SUMMER10',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  discountCode?: string;
}
