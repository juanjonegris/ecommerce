import { ApiProperty } from '@nestjs/swagger';

import type { OrderStatus } from '@repo/types';

import type { OrderEntity, OrderItemEntity } from '../entities/order.entity';

export class OrderItemResponseDto {
  @ApiProperty({ example: 'clitem0000000000000000000' })
  id!: string;

  @ApiProperty({ example: 'clprod0000000000000000000' })
  productId!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 79.99 })
  priceAtPurchase!: number;

  static from(item: OrderItemEntity): OrderItemResponseDto {
    const dto = new OrderItemResponseDto();
    dto.id = item.id;
    dto.productId = item.productId;
    dto.name = item.productName ?? '';
    dto.quantity = item.quantity;
    dto.priceAtPurchase = item.priceAtPurchase;
    return dto;
  }
}

export class OrderResponseDto {
  @ApiProperty({ example: 'clorder000000000000000000' })
  id!: string;

  @ApiProperty({ example: 'cluser0000000000000000000', nullable: true })
  customerId!: string | null;

  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    example: 'PENDING',
  })
  status!: OrderStatus;

  @ApiProperty({ example: 159.98 })
  total!: number;

  @ApiProperty({ type: () => [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: OrderEntity): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = entity.id;
    dto.customerId = entity.customerId;
    dto.status = entity.status;
    dto.total = entity.total;
    dto.items = (entity.items ?? []).map((i) => OrderItemResponseDto.from(i));
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
