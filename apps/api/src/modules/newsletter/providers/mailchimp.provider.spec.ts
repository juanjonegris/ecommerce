import { createHash } from 'crypto';

import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import { MailchimpProvider } from './mailchimp.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => values[key] ?? ''),
  } as unknown as ConfigService;
}

describe('MailchimpProvider', () => {
  let provider: MailchimpProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new MailchimpProvider(
      makeConfig({
        MAILCHIMP_API_KEY: 'abc-us21',
        MAILCHIMP_AUDIENCE_ID: 'aud-1',
        MAILCHIMP_WEBHOOK_SECRET: 'shh',
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

  it('upsertSubscriber PUTs to the right URL with Basic auth', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'mc-1', status: 'subscribed' }), {
        status: 200,
      }),
    );

    const result = await provider.upsertSubscriber({
      email: 'jane@example.com',
      doubleOptIn: true,
    });

    const expectedHash = createHash('md5')
      .update('jane@example.com')
      .digest('hex');
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://us21.api.mailchimp.com/3.0/lists/aud-1/members/${expectedHash}`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('anystring:abc-us21').toString('base64')}`,
        }),
      }),
    );
    expect(result.providerSubscriberId).toBe('mc-1');
    expect(result.alreadyExisted).toBe(true);
  });

  it('upsertSubscriber surfaces a structured error on non-2xx', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 400 }));
    await expect(
      provider.upsertSubscriber({ email: 'a@b.c', doubleOptIn: true }),
    ).rejects.toThrow(/Mailchimp API error 400: boom/);
  });

  it('verifyWebhook returns null when the secret mismatches', async () => {
    const result = await provider.verifyWebhook(
      Buffer.from('type=unsubscribe&data[email]=a@b.c'),
      { 'mailchimp-secret': 'wrong' },
    );
    expect(result).toBeNull();
  });

  it('verifyWebhook returns null on length-mismatched secrets (constant-time)', async () => {
    const result = await provider.verifyWebhook(
      Buffer.from('type=unsubscribe&data[email]=a@b.c'),
      { 'mailchimp-secret': 'shorter' },
    );
    expect(result).toBeNull();
  });

  it('verifyWebhook maps unsubscribe → unsubscribe', async () => {
    const result = await provider.verifyWebhook(
      Buffer.from('type=unsubscribe&data[email]=jane@example.com&fired_at=1'),
      { 'mailchimp-secret': 'shh' },
    );
    expect(result).toEqual(
      expect.objectContaining({
        type: 'unsubscribe',
        email: 'jane@example.com',
      }),
    );
  });

  it('verifyWebhook returns null on unknown type', async () => {
    const result = await provider.verifyWebhook(
      Buffer.from('type=upemail&data[email]=jane@example.com'),
      { 'mailchimp-secret': 'shh' },
    );
    expect(result).toBeNull();
  });
});
