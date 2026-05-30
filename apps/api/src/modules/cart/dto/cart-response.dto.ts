import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Cart, CartItem } from '@repo/types';

export class CartItemDto implements CartItem {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  productId!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug!: string;

  @ApiProperty({ example: 79.99 })
  price!: number;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartItemDto] })
  items!: CartItemDto[];

  @ApiPropertyOptional({
    description: 'Guest session id, echoed back so the client can persist it.',
    example: 'a1b2c3d4-0000-4000-8000-000000000000',
  })
  sessionId?: string;

  static from(cart: Cart, sessionId?: string): CartResponseDto {
    const dto = new CartResponseDto();
    dto.items = cart.items;
    if (sessionId !== undefined) dto.sessionId = sessionId;
    return dto;
  }
}
