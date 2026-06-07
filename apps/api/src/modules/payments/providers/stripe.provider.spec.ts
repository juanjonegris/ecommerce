import { BadRequestException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

const createIntent = jest.fn();
const constructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: createIntent },
    webhooks: { constructEvent },
  }));
});

import { StripeProvider } from './stripe.provider';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function buildConfig(overrides: Record<string, string> = {}): ConfigService {
  const map: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    ...overrides,
  };
  return {
    get: jest.fn((k: string) => map[k]),
  } as unknown as ConfigService;
}

describe('StripeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createIntent sends amount in MINOR units and metadata.orderId', async () => {
    createIntent.mockResolvedValue({
      id: 'pi_abc',
      client_secret: 'cs_abc',
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.createIntent({
      orderId: 'order-1',
      amount: 12.5,
      currency: 'usd',
    });

    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1250,
        currency: 'usd',
        metadata: expect.objectContaining({ orderId: 'order-1' }),
      }),
    );
    expect(result).toEqual({
      providerPaymentId: 'pi_abc',
      clientSecret: 'cs_abc',
    });
  });

  it('verifyWebhook throws BadRequestException on tampered signature', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    await expect(
      provider.verifyWebhook(Buffer.from('{}'), 'bad-sig'),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifyWebhook maps payment_intent.succeeded → SUCCEEDED', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', amount: 1000, amount_received: 1000 } },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result).toEqual({
      eventId: 'evt_1',
      type: 'payment_intent.succeeded',
      providerPaymentId: 'pi_1',
      status: 'SUCCEEDED',
      amountReceived: 10,
    });
  });

  it('verifyWebhook maps payment_intent.payment_failed → FAILED with reason', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_2',
          amount: 1000,
          last_payment_error: { message: 'card_declined' },
        },
      },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result).toMatchObject({
      status: 'FAILED',
      failureReason: 'card_declined',
    });
  });

  it('verifyWebhook maps payment_intent.processing → PROCESSING', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'payment_intent.processing',
      data: { object: { id: 'pi_3', amount: 1000 } },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result?.status).toBe('PROCESSING');
  });

  it('verifyWebhook maps payment_intent.canceled → CANCELLED', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_4',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_4', amount: 1000 } },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result?.status).toBe('CANCELLED');
  });

  it('verifyWebhook maps charge.refunded → REFUNDED via payment_intent reference', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_5',
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_5' } },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result).toMatchObject({
      providerPaymentId: 'pi_5',
      status: 'REFUNDED',
    });
  });

  it('verifyWebhook returns null for events we do not care about', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_6',
      type: 'customer.updated',
      data: { object: {} },
    });
    const provider = new StripeProvider(
      buildConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    const result = await provider.verifyWebhook(Buffer.from('{}'), 'sig');

    expect(result).toBeNull();
  });

  it('verifyWebhook throws when STRIPE_WEBHOOK_SECRET is missing', async () => {
    const provider = new StripeProvider(
      buildConfig({ STRIPE_WEBHOOK_SECRET: '' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );

    await expect(
      provider.verifyWebhook(Buffer.from('{}'), 'sig'),
    ).rejects.toThrow(BadRequestException);
  });
});
