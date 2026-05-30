import {
  OrderEntity,
  OrderItemEntity,
} from '@/modules/orders/entities/order.entity';

let counter = 0;

export function createMockOrderItem(
  overrides: Partial<OrderItemEntity> = {},
): OrderItemEntity {
  const n = ++counter;
  const item = new OrderItemEntity();
  item.id = `order-item-${String(n)}`;
  item.orderId = `order-${String(n)}`;
  item.productId = `product-${String(n)}`;
  item.quantity = 1;
  item.priceAtPurchase = 29.99;
  item.productName = `Test Product ${String(n)}`;
  return Object.assign(item, overrides);
}

export function createMockOrder(
  overrides: Partial<OrderEntity> = {},
): OrderEntity {
  const n = ++counter;
  const order = new OrderEntity();
  order.id = `order-${String(n)}`;
  order.customerId = 'user-1';
  order.status = 'PENDING';
  order.total = 59.98;
  order.createdAt = new Date('2026-01-01');
  order.updatedAt = new Date('2026-01-01');
  order.items = [createMockOrderItem()];
  return Object.assign(order, overrides);
}
