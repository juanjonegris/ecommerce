import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { OrderEntity } from '@/modules/orders/entities/order.entity';
import type { OrdersService } from '@/modules/orders/orders.service';
import { OutOfStockError } from '@/modules/products/products.repository';

import { createMockOrder } from '../../../test/factories/order.factory';
import { createMockPayment } from '../../../test/factories/payment.factory';

import type { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import type { PaymentProviderAdapter } from './providers/payment-provider.interface';
import type { WebhookEventsRepository } from './webhook-events.repository';

const mockRepo: jest.Mocked<
  Pick<
    PaymentsRepository,
    | 'create'
    | 'findById'
    | 'findByProviderPaymentId'
    | 'findByOrder'
    | 'existsSucceededForOrder'
    | 'updateStatus'
  >
> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByProviderPaymentId: jest.fn(),
  findByOrder: jest.fn(),
  existsSucceededForOrder: jest.fn(),
  updateStatus: jest.fn(),
};

const mockWebhookEvents: jest.Mocked<
  Pick<WebhookEventsRepository, 'recordEvent'>
> = {
  recordEvent: jest.fn(),
};

const mockProvider: jest.Mocked<PaymentProviderAdapter> = {
  name: 'STRIPE',
  createIntent: jest.fn(),
  verifyWebhook: jest.fn(),
};

const mockOrders: jest.Mocked<
  Pick<OrdersService, 'findByIdInternal' | 'markPaid'>
> = {
  findByIdInternal: jest.fn(),
  markPaid: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('usd'),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

const customerUser: UserEntity = {
  id: 'user-1',
  email: 'buyer@example.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'hash',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(() => {
    service = new PaymentsService(
      mockRepo as unknown as PaymentsRepository,
      mockWebhookEvents as unknown as WebhookEventsRepository,
      mockProvider,
      mockOrders as unknown as OrdersService,
      mockConfig as unknown as ConfigService,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('usd');
    mockCls.getId.mockReturnValue('req-id');
  });

  describe('createIntent', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      mockOrders.findByIdInternal.mockRejectedValue(
        new NotFoundException('missing'),
      );

      await expect(
        service.createIntent('missing', customerUser, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a customer requests another user order', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({ id: 'o1', customerId: 'someone-else' }),
      );

      await expect(
        service.createIntent('o1', customerUser, undefined),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the order is not PENDING', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          customerId: 'user-1',
          status: 'CONFIRMED',
        }),
      );

      await expect(
        service.createIntent('o1', customerUser, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a SUCCEEDED payment already exists', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({ id: 'o1', customerId: 'user-1', status: 'PENDING' }),
      );
      mockRepo.existsSucceededForOrder.mockResolvedValue(true);

      await expect(
        service.createIntent('o1', customerUser, undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('persists payment and returns clientSecret on success', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          customerId: 'user-1',
          status: 'PENDING',
          total: 50,
        }),
      );
      mockRepo.existsSucceededForOrder.mockResolvedValue(false);
      mockProvider.createIntent.mockResolvedValue({
        providerPaymentId: 'pi_test_1',
        clientSecret: 'cs_test_1',
      });
      const persisted = createMockPayment({
        id: 'pay-1',
        orderId: 'o1',
        providerPaymentId: 'pi_test_1',
        clientSecret: 'cs_test_1',
      });
      mockRepo.create.mockResolvedValue(persisted);

      const result = await service.createIntent('o1', customerUser, undefined);

      expect(mockProvider.createIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'o1',
          amount: 50,
          currency: 'usd',
          customerEmail: 'buyer@example.com',
        }),
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'o1',
          provider: 'STRIPE',
          providerPaymentId: 'pi_test_1',
          amount: 50,
          currency: 'usd',
          clientSecret: 'cs_test_1',
        }),
      );
      expect(result).toBe(persisted);
    });

    it('allows guest orders when a session header is provided', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({
          id: 'o-guest',
          customerId: null,
          status: 'PENDING',
        }),
      );
      mockRepo.existsSucceededForOrder.mockResolvedValue(false);
      mockProvider.createIntent.mockResolvedValue({
        providerPaymentId: 'pi_test_g',
        clientSecret: 'cs_test_g',
      });
      mockRepo.create.mockResolvedValue(createMockPayment());

      await service.createIntent('o-guest', undefined, 'sess-123');

      expect(mockProvider.createIntent).toHaveBeenCalled();
    });

    it('rejects guest orders without a session header', async () => {
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({
          id: 'o-guest',
          customerId: null,
          status: 'PENDING',
        }),
      );

      await expect(
        service.createIntent('o-guest', undefined, undefined),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('{}');

    it('ignores events the provider does not care about', async () => {
      mockProvider.verifyWebhook.mockResolvedValue(null);

      await service.handleWebhook(rawBody, 'sig');

      expect(mockWebhookEvents.recordEvent).not.toHaveBeenCalled();
    });

    it('skips duplicate eventId deliveries', async () => {
      mockProvider.verifyWebhook.mockResolvedValue({
        eventId: 'evt_1',
        type: 'payment_intent.succeeded',
        providerPaymentId: 'pi_1',
        status: 'SUCCEEDED',
      });
      mockWebhookEvents.recordEvent.mockResolvedValue(false);

      await service.handleWebhook(rawBody, 'sig');

      expect(mockRepo.findByProviderPaymentId).not.toHaveBeenCalled();
      expect(mockOrders.markPaid).not.toHaveBeenCalled();
    });

    it('does nothing when the payment row is unknown', async () => {
      mockProvider.verifyWebhook.mockResolvedValue({
        eventId: 'evt_2',
        type: 'payment_intent.succeeded',
        providerPaymentId: 'pi_unknown',
        status: 'SUCCEEDED',
      });
      mockWebhookEvents.recordEvent.mockResolvedValue(true);
      mockRepo.findByProviderPaymentId.mockResolvedValue(null);

      await service.handleWebhook(rawBody, 'sig');

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockOrders.markPaid).not.toHaveBeenCalled();
    });

    it('SUCCEEDED updates status and calls OrdersService.markPaid', async () => {
      mockProvider.verifyWebhook.mockResolvedValue({
        eventId: 'evt_3',
        type: 'payment_intent.succeeded',
        providerPaymentId: 'pi_3',
        status: 'SUCCEEDED',
      });
      mockWebhookEvents.recordEvent.mockResolvedValue(true);
      const payment = createMockPayment({
        id: 'pay-3',
        orderId: 'order-3',
        providerPaymentId: 'pi_3',
      });
      mockRepo.findByProviderPaymentId.mockResolvedValue(payment);
      mockOrders.markPaid.mockResolvedValue({} as OrderEntity);

      await service.handleWebhook(rawBody, 'sig');

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'pay-3',
        'SUCCEEDED',
        null,
      );
      expect(mockOrders.markPaid).toHaveBeenCalledWith('order-3');
    });

    it('FAILED records failureReason and does NOT touch the order', async () => {
      mockProvider.verifyWebhook.mockResolvedValue({
        eventId: 'evt_4',
        type: 'payment_intent.payment_failed',
        providerPaymentId: 'pi_4',
        status: 'FAILED',
        failureReason: 'card_declined',
      });
      mockWebhookEvents.recordEvent.mockResolvedValue(true);
      const payment = createMockPayment({
        id: 'pay-4',
        orderId: 'order-4',
        providerPaymentId: 'pi_4',
      });
      mockRepo.findByProviderPaymentId.mockResolvedValue(payment);

      await service.handleWebhook(rawBody, 'sig');

      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'pay-4',
        'FAILED',
        'card_declined',
      );
      expect(mockOrders.markPaid).not.toHaveBeenCalled();
    });

    it('stock conflict during markPaid marks payment FAILED with STOCK_CONFLICT', async () => {
      mockProvider.verifyWebhook.mockResolvedValue({
        eventId: 'evt_5',
        type: 'payment_intent.succeeded',
        providerPaymentId: 'pi_5',
        status: 'SUCCEEDED',
      });
      mockWebhookEvents.recordEvent.mockResolvedValue(true);
      const payment = createMockPayment({
        id: 'pay-5',
        orderId: 'order-5',
        providerPaymentId: 'pi_5',
      });
      mockRepo.findByProviderPaymentId.mockResolvedValue(payment);
      mockOrders.markPaid.mockRejectedValue(new OutOfStockError('product-x'));

      await expect(
        service.handleWebhook(rawBody, 'sig'),
      ).resolves.toBeUndefined();

      expect(mockRepo.updateStatus).toHaveBeenLastCalledWith(
        'pay-5',
        'FAILED',
        'STOCK_CONFLICT',
      );
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when missing', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.findById('missing', { id: 'user-1', role: UserRole.CUSTOMER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when customer fetches another user payment', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockPayment({ id: 'p1', orderId: 'o1' }),
      );
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({ id: 'o1', customerId: 'other-user' }),
      );

      await expect(
        service.findById('p1', { id: 'user-1', role: UserRole.CUSTOMER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns payment when actor owns the underlying order', async () => {
      const payment = createMockPayment({ id: 'p1', orderId: 'o1' });
      mockRepo.findById.mockResolvedValue(payment);
      mockOrders.findByIdInternal.mockResolvedValue(
        createMockOrder({ id: 'o1', customerId: 'user-1' }),
      );

      await expect(
        service.findById('p1', { id: 'user-1', role: UserRole.CUSTOMER }),
      ).resolves.toBe(payment);
    });
  });
});
