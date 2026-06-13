import { createHmac } from 'crypto';

import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import { KlaviyoProvider } from './klaviyo.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => values[key] ?? ''),
  } as unknown as ConfigService;
}

describe('KlaviyoProvider', () => {
  let provider: KlaviyoProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new KlaviyoProvider(
      makeConfig({
        KLAVIYO_API_KEY: 'pk_test',
        KLAVIYO_LIST_ID: 'list-1',
        KLAVIYO_WEBHOOK_SECRET: 'whsec',
      }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('upsertSubscriber POSTs with Klaviyo-API-Key + revision headers', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'job-1' } }), { status: 202 }),
    );

    const result = await provider.upsertSubscriber({
      email: 'jane@example.com',
      doubleOptIn: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Klaviyo-API-Key pk_test',
          revision: expect.any(String) as unknown as string,
        }),
      }),
    );
    expect(result.providerSubscriberId).toBe('job-1');
  });

  it('upsertSubscriber surfaces a structured error on non-2xx', async () => {
    fetchSpy.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(
      provider.upsertSubscriber({ email: 'a@b.c', doubleOptIn: true }),
    ).rejects.toThrow(/Klaviyo API error 500: nope/);
  });

  it('verifyWebhook returns null when signature mismatches', async () => {
    const result = await provider.verifyWebhook(Buffer.from('{}'), {
      'x-klaviyo-signature': 'invalid',
    });
    expect(result).toBeNull();
  });

  it('verifyWebhook maps a valid event to our shape', async () => {
    const body = Buffer.from(
      JSON.stringify({
        data: {
          id: 'evt-1',
          attributes: {
            metric: { name: 'Unsubscribed from List' },
            profile: { email: 'jane@example.com', id: 'p-1' },
          },
        },
      }),
    );
    const sig = createHmac('sha256', 'whsec').update(body).digest('base64');

    const result = await provider.verifyWebhook(body, {
      'x-klaviyo-signature': sig,
    });
    expect(result).toEqual({
      eventId: 'evt-1',
      type: 'unsubscribe',
      email: 'jane@example.com',
      providerSubscriberId: 'p-1',
    });
  });

  it('verifyWebhook returns null on unknown metric', async () => {
    const body = Buffer.from(
      JSON.stringify({
        data: {
          attributes: {
            metric: { name: 'Some Other Thing' },
            profile: { email: 'a@b.c' },
          },
        },
      }),
    );
    const sig = createHmac('sha256', 'whsec').update(body).digest('base64');
    await expect(
      provider.verifyWebhook(body, { 'x-klaviyo-signature': sig }),
    ).resolves.toBeNull();
  });
});
