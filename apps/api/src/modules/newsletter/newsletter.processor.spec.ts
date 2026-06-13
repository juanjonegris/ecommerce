import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import { createMockSubscriber } from '../../../test/factories/newsletter.factory';

import type { NewsletterJobData } from './newsletter-job.types';
import { NewsletterProcessor } from './newsletter.processor';
import type { NewsletterRepository } from './newsletter.repository';
import type { NewsletterProviderAdapter } from './providers/newsletter-provider.interface';

const mockProvider: jest.Mocked<NewsletterProviderAdapter> = {
  name: 'mailchimp',
  upsertSubscriber: jest.fn(),
  unsubscribe: jest.fn(),
  verifyWebhook: jest.fn(),
};

const mockRepo: jest.Mocked<Pick<NewsletterRepository, 'findById' | 'update'>> =
  {
    findById: jest.fn(),
    update: jest.fn(),
  };

const mockConfig = {
  get: jest.fn((key: string): unknown => {
    if (key === 'NEWSLETTER_DOUBLE_OPT_IN') return true;
    return '';
  }),
} as unknown as ConfigService;

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeJob(
  name: string,
  data: NewsletterJobData,
  attemptsMade = 0,
  attempts = 3,
): Job<NewsletterJobData> {
  return {
    id: 'job-1',
    name,
    data,
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<NewsletterJobData>;
}

describe('NewsletterProcessor', () => {
  let processor: NewsletterProcessor;

  beforeEach(() => {
    processor = new NewsletterProcessor(
      mockProvider,
      mockRepo as unknown as NewsletterRepository,
      mockConfig,
      mockLogger as unknown as LoggerService,
    );
    jest.clearAllMocks();
  });

  it('(1) upsert success — provider called + repo.update with SYNCED', async () => {
    const sub = createMockSubscriber({ id: 's1', email: 'a@b.c' });
    mockRepo.findById.mockResolvedValue(sub);
    mockProvider.upsertSubscriber.mockResolvedValue({
      providerSubscriberId: 'mc-1',
      alreadyExisted: false,
    });

    await processor.process(
      makeJob('upsert-subscriber', { subscriberId: 's1' }),
    );

    expect(mockProvider.upsertSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.c' }),
    );
    expect(mockRepo.update).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        providerSubscriberId: 'mc-1',
        provider: 'mailchimp',
        syncState: 'SYNCED',
      }),
    );
  });

  it('(2) upsert failure (non-final) — lastSyncError set, syncState stays PENDING_SYNC, rethrows', async () => {
    const sub = createMockSubscriber({ id: 's2' });
    mockRepo.findById.mockResolvedValue(sub);
    mockProvider.upsertSubscriber.mockRejectedValue(new Error('boom'));

    await expect(
      processor.process(
        makeJob('upsert-subscriber', { subscriberId: 's2' }, 0, 3),
      ),
    ).rejects.toThrow('boom');

    const patch = mockRepo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).toEqual(expect.objectContaining({ lastSyncError: 'boom' }));
    expect(patch.syncState).toBeUndefined();
  });

  it('(3) upsert failure (final attempt) — sets syncState=FAILED', async () => {
    const sub = createMockSubscriber({ id: 's3' });
    mockRepo.findById.mockResolvedValue(sub);
    mockProvider.upsertSubscriber.mockRejectedValue(new Error('boom'));

    await expect(
      processor.process(
        makeJob('upsert-subscriber', { subscriberId: 's3' }, 2, 3),
      ),
    ).rejects.toThrow('boom');

    expect(mockRepo.update).toHaveBeenCalledWith(
      's3',
      expect.objectContaining({ syncState: 'FAILED', lastSyncError: 'boom' }),
    );
  });

  it('(4) unsubscribe success — provider.unsubscribe called', async () => {
    mockProvider.unsubscribe.mockResolvedValue(undefined);

    await processor.process(makeJob('unsubscribe', { email: 'a@b.c' }));

    expect(mockProvider.unsubscribe).toHaveBeenCalledWith('a@b.c');
  });

  it('upsert on missing row — skips with warn, no throw', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      processor.process(makeJob('upsert-subscriber', { subscriberId: 'gone' })),
    ).resolves.toBeUndefined();

    expect(mockProvider.upsertSubscriber).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'newsletter.processor.upsert_skipped_missing_row',
      }),
    );
  });
});
