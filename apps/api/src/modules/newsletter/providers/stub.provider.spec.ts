import { createHash } from 'crypto';

import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { StubNewsletterProvider } from './stub.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('StubNewsletterProvider', () => {
  let provider: StubNewsletterProvider;

  beforeEach(() => {
    provider = new StubNewsletterProvider(
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
  });

  it('upsertSubscriber returns md5(email) as providerSubscriberId', async () => {
    const email = 'jane@example.com';
    const result = await provider.upsertSubscriber({
      email,
      doubleOptIn: true,
    });
    const expected = createHash('md5').update(email).digest('hex');
    expect(result.providerSubscriberId).toBe(expected);
    expect(result.alreadyExisted).toBe(false);
  });

  it('unsubscribe is a no-op that resolves', async () => {
    await expect(
      provider.unsubscribe('jane@example.com'),
    ).resolves.toBeUndefined();
  });

  it('verifyWebhook returns null (uninteresting)', async () => {
    await expect(
      provider.verifyWebhook(Buffer.from('anything'), {}),
    ).resolves.toBeNull();
  });
});
