import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import type { UserEntity } from '@/modules/auth/entities/user.entity';

import { createMockPayment } from '../../../test/factories/payment.factory';

import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';

const mockService = {
  createIntent: jest.fn(),
  handleWebhook: jest.fn(),
  findById: jest.fn(),
  findByOrder: jest.fn(),
};

const customer: UserEntity = {
  id: 'user-1',
  email: 'a@a.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(() => {
    controller = new PaymentsController(
      mockService as unknown as PaymentsService,
    );
    jest.clearAllMocks();
  });

  describe('createIntent', () => {
    it('delegates to service and returns the create-intent DTO with clientSecret', async () => {
      const payment = createMockPayment({
        id: 'pay-1',
        providerPaymentId: 'pi_1',
        clientSecret: 'cs_1',
      });
      mockService.createIntent.mockResolvedValue(payment);

      const result = await controller.createIntent(customer, 'sess-1', {
        orderId: 'o1',
      });

      expect(mockService.createIntent).toHaveBeenCalledWith(
        'o1',
        customer,
        'sess-1',
      );
      expect(result).toEqual({
        paymentId: 'pay-1',
        providerPaymentId: 'pi_1',
        clientSecret: 'cs_1',
      });
    });
  });

  describe('webhook', () => {
    function makeReq(rawBody: Buffer | undefined): RawBodyRequest<Request> {
      return { rawBody } as unknown as RawBodyRequest<Request>;
    }

    it('throws BadRequestException when stripe-signature header is missing', async () => {
      await expect(
        controller.webhook(makeReq(Buffer.from('{}')), undefined),
      ).rejects.toThrow(BadRequestException);
      expect(mockService.handleWebhook).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when rawBody is not available', async () => {
      await expect(
        controller.webhook(makeReq(undefined), 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes raw body + signature through to the service', async () => {
      mockService.handleWebhook.mockResolvedValue(undefined);
      const body = Buffer.from('{"x":1}');

      const result = await controller.webhook(makeReq(body), 'sig');

      expect(mockService.handleWebhook).toHaveBeenCalledWith(body, 'sig');
      expect(result).toEqual({ received: true });
    });
  });

  describe('findOne', () => {
    it('delegates to service and returns the payment DTO (no clientSecret leak)', async () => {
      mockService.findById.mockResolvedValue(createMockPayment({ id: 'p1' }));

      const result = await controller.findOne(customer, 'p1');

      expect(mockService.findById).toHaveBeenCalledWith('p1', {
        id: 'user-1',
        role: UserRole.CUSTOMER,
      });
      expect(result.id).toBe('p1');
      // PaymentResponseDto deliberately omits clientSecret
      expect(result).not.toHaveProperty('clientSecret');
    });
  });

  describe('findByOrder', () => {
    it('returns an array of payment DTOs', async () => {
      mockService.findByOrder.mockResolvedValue([
        createMockPayment({ id: 'p1' }),
        createMockPayment({ id: 'p2' }),
      ]);

      const result = await controller.findByOrder(customer, 'o1');

      expect(mockService.findByOrder).toHaveBeenCalledWith('o1', {
        id: 'user-1',
        role: UserRole.CUSTOMER,
      });
      expect(result).toHaveLength(2);
    });
  });
});
