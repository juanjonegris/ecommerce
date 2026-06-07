import type { Order, OrderItem, OrderStatus } from '@repo/types';

export class OrderItemEntity implements OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  quantity!: number;
  priceAtPurchase!: number;
  // Denormalized from the included Product relation for response output.
  // Not part of the OrderItem interface — populated by the repository.
  productName?: string;
}

export class OrderEntity implements Order {
  id!: string;
  customerId!: string | null;
  status!: OrderStatus;
  total!: number;
  discountCodeId!: string | null;
  discountAmount!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
  items?: OrderItemEntity[];
}
