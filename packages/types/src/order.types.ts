import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  priceAtPurchase: number;
}

export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  quantity: z.number().int().positive(),
  priceAtPurchase: z.number().nonnegative(),
});

export interface Order {
  id: string;
  customerId: string | null;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  items?: OrderItem[];
}

export const OrderSchema = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  status: OrderStatusSchema,
  total: z.number().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(OrderItemSchema).optional(),
});
