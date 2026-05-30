import { Injectable } from '@nestjs/common';
import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  OrderStatus,
  Prisma,
  Product as PrismaProduct,
} from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { ProductsRepository } from '@/modules/products/products.repository';
import { PrismaService } from '@/prisma/prisma.service';

import { OrderEntity, OrderItemEntity } from './entities/order.entity';

interface CreateOrderData {
  customerId: string | null;
  total: number;
  items: { productId: string; quantity: number; price: number }[];
}

interface FindOrdersFilters {
  customerId?: string;
  status?: OrderStatus;
  page: number;
  limit: number;
}

type OrderRow = PrismaOrder & {
  items: (PrismaOrderItem & { product: PrismaProduct })[];
};

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
  ) {}

  async create(data: CreateOrderData): Promise<OrderEntity> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: data.customerId,
          status: 'PENDING',
          total: data.total,
          items: {
            create: data.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceAtPurchase: i.price,
            })),
          },
        },
        include: { items: { include: { product: true } } },
      });

      for (const i of data.items) {
        await this.products.decrementStock(i.productId, i.quantity, tx);
      }

      return this.toEntity(order);
    });
  }

  async findAll(
    filters: FindOrdersFilters,
  ): Promise<PaginatedResponse<OrderEntity>> {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { product: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data: rows.map((r) => this.toEntity(r)), total, page, limit };
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    return row ? this.toEntity(row) : null;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderEntity> {
    const row = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { product: true } } },
    });
    return this.toEntity(row);
  }

  private toEntity(row: OrderRow): OrderEntity {
    const e = new OrderEntity();
    e.id = row.id;
    e.customerId = row.customerId;
    e.status = row.status;
    e.total = Number(row.total);
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    e.items = row.items.map((i) => this.toItemEntity(i));
    return e;
  }

  private toItemEntity(
    row: PrismaOrderItem & { product: PrismaProduct },
  ): OrderItemEntity {
    const e = new OrderItemEntity();
    e.id = row.id;
    e.orderId = row.orderId;
    e.productId = row.productId;
    e.quantity = row.quantity;
    e.priceAtPurchase = Number(row.priceAtPurchase);
    e.productName = row.product.name;
    return e;
  }
}
