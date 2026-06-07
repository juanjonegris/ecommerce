import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import { OutOfStockError } from '@/modules/products/products.repository';

import { OrdersService } from '../orders/orders.service';

import type { PaymentEntity } from './entities/payment.entity';
import { PaymentsRepository } from './payments.repository';
import {
  PAYMENT_PROVIDER,
  type PaymentProviderAdapter,
} from './providers/payment-provider.interface';
import { WebhookEventsRepository } from './webhook-events.repository';

interface Actor {
  id: string;
  role: UserRole;
}

/** Internal actor used when looking up a payment from a session-only context. */
const isOwner = (
  customerId: string | null,
  actor: Actor | undefined,
): boolean => {
  if (!actor) return customerId === null;
  if (actor.role === UserRole.ADMIN) return true;
  return customerId === actor.id;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly webhookEvents: WebhookEventsRepository,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProviderAdapter,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async createIntent(
    orderId: string,
    user: UserEntity | undefined,
    sessionId: string | undefined,
  ): Promise<PaymentEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'payment.service.create_intent_started',
      requestId,
      orderId,
      hasUser: user !== undefined,
    });

    const order = await this.orders.findByIdInternal(orderId);

    // Ownership: registered orders require a matching user (or ADMIN); guest
    // orders require a non-empty session header. We don't currently persist the
    // cart session on Order — strict session-match is a follow-up.
    if (order.customerId !== null) {
      if (user === undefined) {
        throw new ForbiddenException('Authentication required for this order');
      }
      if (user.role !== UserRole.ADMIN && order.customerId !== user.id) {
        throw new ForbiddenException('You do not have access to this order');
      }
    } else if (!sessionId) {
      throw new ForbiddenException('Cart session required for guest order');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order is not payable from status ${order.status}`,
      );
    }

    if (await this.repository.existsSucceededForOrder(orderId)) {
      throw new ConflictException('Order already paid');
    }

    const currency =
      this.config.get<AppConfig['STRIPE_CURRENCY']>('STRIPE_CURRENCY') ?? 'usd';

    const intentInput = {
      orderId,
      amount: order.total,
      currency,
      ...(user?.email !== undefined ? { customerEmail: user.email } : {}),
      metadata: { orderId },
    };
    const intent = await this.provider.createIntent(intentInput);

    const payment = await this.repository.create({
      orderId,
      provider: this.provider.name,
      providerPaymentId: intent.providerPaymentId,
      amount: order.total,
      currency,
      clientSecret: intent.clientSecret,
    });

    this.logger.log({
      message: 'payment.service.create_intent_succeeded',
      requestId,
      orderId,
      paymentId: payment.id,
      providerPaymentId: intent.providerPaymentId,
    });

    return payment;
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'payment.webhook.received',
      requestId,
      provider: this.provider.name,
    });

    const verified = await this.provider.verifyWebhook(rawBody, signature);
    if (verified === null) {
      this.logger.log({
        message: 'payment.webhook.ignored',
        requestId,
      });
      return;
    }

    const inserted = await this.webhookEvents.recordEvent(
      this.provider.name,
      verified.eventId,
      verified.type,
    );
    if (!inserted) {
      this.logger.log({
        message: 'payment.webhook.duplicate_skipped',
        requestId,
        eventId: verified.eventId,
      });
      return;
    }

    const payment = await this.repository.findByProviderPaymentId(
      this.provider.name,
      verified.providerPaymentId,
    );
    if (!payment) {
      this.logger.warn({
        message: 'payment.webhook.unknown_payment',
        requestId,
        providerPaymentId: verified.providerPaymentId,
      });
      return;
    }

    await this.repository.updateStatus(
      payment.id,
      verified.status,
      verified.failureReason ?? null,
    );

    if (verified.status === 'SUCCEEDED') {
      try {
        await this.orders.markPaid(payment.orderId);
        this.logger.log({
          message: 'payment.webhook.processed',
          requestId,
          orderId: payment.orderId,
          paymentId: payment.id,
        });
      } catch (err) {
        if (err instanceof OutOfStockError) {
          await this.repository.updateStatus(
            payment.id,
            'FAILED',
            'STOCK_CONFLICT',
          );
          this.logger.error({
            message: 'payment.webhook.stock_conflict',
            requestId,
            orderId: payment.orderId,
            paymentId: payment.id,
            productId: err.productId,
          });
          return;
        }
        this.logger.error({
          message: 'payment.webhook.failed',
          requestId,
          orderId: payment.orderId,
          paymentId: payment.id,
          error: err instanceof Error ? err.message : String(err),
        });
        // Swallow: webhook must respond 200 once we've recorded the event so
        // the provider stops retrying. Manual recovery is left for ops.
      }
    }
  }

  async findById(id: string, actor: Actor): Promise<PaymentEntity> {
    const payment = await this.repository.findById(id);
    if (!payment) throw new NotFoundException(`Payment "${id}" not found`);
    const order = await this.orders.findByIdInternal(payment.orderId);
    if (!isOwner(order.customerId, actor)) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    return payment;
  }

  async findByOrder(orderId: string, actor: Actor): Promise<PaymentEntity[]> {
    const order = await this.orders.findByIdInternal(orderId);
    if (!isOwner(order.customerId, actor)) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return this.repository.findByOrder(orderId);
  }
}
