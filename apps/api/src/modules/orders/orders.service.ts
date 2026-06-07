import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { PaginatedResponse } from '@repo/types';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { CartIdentity } from '@/modules/cart/cart.service';
import { CartService } from '@/modules/cart/cart.service';
import { ProductsRepository } from '@/modules/products/products.repository';
import { EmailQueue } from '@/queues/emails/email-queue.service';

import type { CreateOrderDto } from './dto/create-order.dto';
import type { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import type { OrderEntity } from './entities/order.entity';
import { OrdersRepository } from './orders.repository';

// Allowed status transitions. Role/ownership rules are enforced separately:
// PENDING→CANCELLED is open to the owning customer, every other transition is
// admin-only. DELIVERED and CANCELLED are terminal.
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

interface Actor {
  id: string;
  role: UserRole;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly products: ProductsRepository,
    private readonly cart: CartService,
    private readonly emailQueue: EmailQueue,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async create(
    user: UserEntity | undefined,
    sessionId: string | undefined,
    dto: CreateOrderDto,
  ): Promise<OrderEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'order.service.create_started',
      requestId,
      customerId: user?.id ?? null,
      hasShippingAddress: dto.shippingAddress !== undefined,
    });

    const identity: CartIdentity | null = user
      ? { type: 'user', id: user.id }
      : sessionId
        ? { type: 'guest', id: sessionId }
        : null;

    const cart = identity ? await this.cart.getCart(identity) : { items: [] };
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    for (const item of cart.items) {
      const product = await this.products.findById(item.productId);
      if (!product?.isActive) {
        throw new BadRequestException(
          `Product "${item.productId}" is not available`,
        );
      }
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${item.productId}"`,
        );
      }
    }

    const total = this.round2(
      cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    );

    const order = await this.repository.create({
      customerId: user?.id ?? null,
      total,
      items: cart.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
      })),
    });

    // identity is non-null here: a non-empty cart can only come from a resolved
    // user or guest session.
    if (identity) await this.cart.clear(identity);

    // No email here — the order is still unpaid (PENDING). The confirmation
    // email is enqueued from markPaid() once a payment webhook succeeds.

    this.logger.log({
      message: 'order.service.create_succeeded',
      requestId,
      orderId: order.id,
      total: order.total,
    });
    return order;
  }

  /**
   * Bypasses ownership checks — for use by PaymentsService, which trusts the
   * payment's own ownership rules. Do NOT expose this through a controller.
   */
  async findByIdInternal(id: string): Promise<OrderEntity> {
    return this.loadOrThrow(id);
  }

  /**
   * Called by PaymentsService when a webhook confirms payment success.
   * Idempotent: a second call for an already-CONFIRMED order is a no-op.
   * Propagates OutOfStockError so the payment can be marked FAILED.
   */
  async markPaid(orderId: string): Promise<OrderEntity> {
    const requestId = this.cls.getId();
    const order = await this.loadOrThrow(orderId);

    if (order.status === OrderStatus.CONFIRMED) {
      this.logger.log({
        message: 'order.service.mark_paid_noop',
        requestId,
        orderId,
      });
      return order;
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order is not payable from status ${order.status}`,
      );
    }

    this.logger.log({
      message: 'order.service.mark_paid_started',
      requestId,
      orderId,
    });

    const updated = await this.repository.confirmAndDecrementStock(orderId);

    const email = await this.repository.findCustomerEmail(orderId);
    if (email) {
      await this.emailQueue.enqueueOrderConfirmation({
        to: email,
        orderId: updated.id,
        total: updated.total,
      });
    }

    this.logger.log({
      message: 'order.service.mark_paid_succeeded',
      requestId,
      orderId,
    });
    return updated;
  }

  async findAll(
    userId: string,
    role: UserRole,
    query: FindOrdersQueryDto,
  ): Promise<PaginatedResponse<OrderEntity>> {
    return this.repository.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      ...(query.status ? { status: query.status } : {}),
      ...(role === UserRole.ADMIN ? {} : { customerId: userId }),
    });
  }

  async findById(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<OrderEntity> {
    const order = await this.loadOrThrow(id);
    if (role !== UserRole.ADMIN && order.customerId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }

  async transitionStatus(
    id: string,
    target: OrderStatus,
    actor: Actor,
  ): Promise<OrderEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'order.service.transition_status_started',
      requestId,
      orderId: id,
      target,
    });

    const order = await this.loadOrThrow(id);

    if (!VALID_TRANSITIONS[order.status].includes(target)) {
      throw new BadRequestException(
        `Cannot transition order from ${order.status} to ${target}`,
      );
    }

    const isAdmin = actor.role === UserRole.ADMIN;
    const customerCancel =
      target === OrderStatus.CANCELLED &&
      order.status === OrderStatus.PENDING &&
      order.customerId === actor.id;
    if (!isAdmin && !customerCancel) {
      throw new ForbiddenException(
        'You are not allowed to perform this transition',
      );
    }

    const updated = await this.repository.updateStatus(id, target);

    this.logger.log({
      message: 'order.service.transition_status_succeeded',
      requestId,
      orderId: id,
      status: target,
    });
    return updated;
  }

  async cancel(id: string, actor: Actor): Promise<OrderEntity> {
    return this.transitionStatus(id, OrderStatus.CANCELLED, actor);
  }

  // Loads an order without ownership filtering (used by transitions, which run
  // their own role/ownership checks).
  private async loadOrThrow(id: string): Promise<OrderEntity> {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundException(`Order "${id}" not found`);
    return order;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
