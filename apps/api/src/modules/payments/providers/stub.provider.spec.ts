import { BadRequestException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { StubPaymentProvider } from './stub.provider';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('StubPaymentProvider', () => {
  let provider: StubPaymentProvider;

  beforeEach(() => {
    provider = new StubPaymentProvider(
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
  });

  describe('createIntent', () => {
    it('returns deterministic stub-shaped ids', async () => {
      const result = await provider.createIntent({
        orderId: 'o1',
        amount: 25,
        currency: 'usd',
      });

      expect(result.providerPaymentId).toMatch(/^pi_stub_/);
      expect(result.clientSecret).toMatch(/^cs_stub_/);
    });
  });

  describe('verifyWebhook', () => {
    it('throws BadRequestException on any signature other than "stub"', async () => {
      await expect(
        provider.verifyWebhook(Buffer.from('{}'), 'real-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('parses a valid stub payload', async () => {
      const body = Buffer.from(
        JSON.stringify({
          eventId: 'evt_stub_1',
          type: 'payment_intent.succeeded',
          providerPaymentId: 'pi_stub_x',
          status: 'SUCCEEDED',
        }),
      );

      const result = await provider.verifyWebhook(body, 'stub');

      expect(result).toEqual({
        eventId: 'evt_stub_1',
        type: 'payment_intent.succeeded',
        providerPaymentId: 'pi_stub_x',
        status: 'SUCCEEDED',
      });
    });

    it('rejects malformed JSON bodies', async () => {
      await expect(
        provider.verifyWebhook(Buffer.from('not-json'), 'stub'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown statuses', async () => {
      const body = Buffer.from(
        JSON.stringify({
          eventId: 'evt_1',
          type: 'unknown',
          providerPaymentId: 'pi_1',
          status: 'NOT_A_STATUS',
        }),
      );

      await expect(provider.verifyWebhook(body, 'stub')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
