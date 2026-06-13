import { ConflictException, NotFoundException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { MailService } from '@/mail/mail.service';
import type { PrismaService } from '@/prisma/prisma.service';

import { createMockSubscriber } from '../../../test/factories/newsletter.factory';

import type { NewsletterQueue } from './newsletter.queue.service';
import type { NewsletterRepository } from './newsletter.repository';
import { NewsletterService } from './newsletter.service';
import type {
  NewsletterProviderAdapter,
  VerifiedNewsletterWebhook,
} from './providers/newsletter-provider.interface';

const mockRepo: jest.Mocked<
  Pick<
    NewsletterRepository,
    | 'create'
    | 'findById'
    | 'findByEmail'
    | 'findRawByConfirmationToken'
    | 'update'
    | 'listForAdmin'
    | 'remove'
  >
> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findRawByConfirmationToken: jest.fn(),
  update: jest.fn(),
  listForAdmin: jest.fn(),
  remove: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(
    async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      cb({} as Prisma.TransactionClient),
  ),
};

const mockProvider: jest.Mocked<NewsletterProviderAdapter> = {
  name: 'mailchimp',
  upsertSubscriber: jest.fn(),
  unsubscribe: jest.fn(),
  verifyWebhook: jest.fn(),
};

const mockQueue = {
  enqueueUpsert: jest.fn(),
  enqueueUnsubscribe: jest.fn(),
};

const mockMail = { send: jest.fn() };
const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(doubleOptIn: boolean): ConfigService {
  return {
    get: jest.fn((key: string): unknown => {
      if (key === 'NEWSLETTER_DOUBLE_OPT_IN') return doubleOptIn;
      if (key === 'PUBLIC_WEB_URL') return 'http://localhost:3000';
      return '';
    }),
  } as unknown as ConfigService;
}

function build(doubleOptIn = true): NewsletterService {
  return new NewsletterService(
    mockRepo as unknown as NewsletterRepository,
    mockPrisma as unknown as PrismaService,
    mockProvider,
    mockQueue as unknown as NewsletterQueue,
    mockMail as unknown as MailService,
    makeConfig(doubleOptIn),
    mockLogger as unknown as LoggerService,
    mockCls as unknown as ClsService,
  );
}

describe('NewsletterService', () => {
  let service: NewsletterService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>) =>
        cb({} as Prisma.TransactionClient),
    );
    service = build(true);
  });

  describe('subscribe', () => {
    it('(1) new email — inserts PENDING, enqueues, sends confirmation email', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      const created = createMockSubscriber({
        id: 'sub-new',
        status: 'PENDING',
      });
      mockRepo.create.mockResolvedValue(created);

      await service.subscribe({ email: 'JANE@Example.com' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          status: 'PENDING',
        }),
        expect.anything(),
      );
      expect(mockQueue.enqueueUpsert).toHaveBeenCalledWith({
        subscriberId: 'sub-new',
      });
      expect(mockMail.send).toHaveBeenCalled();
    });

    it('(2) PENDING + recent lastSyncAt — no-op (rate-limit)', async () => {
      mockRepo.findByEmail.mockResolvedValue(
        createMockSubscriber({ status: 'PENDING', lastSyncAt: new Date() }),
      );

      await service.subscribe({ email: 'jane@example.com' });

      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('(3) PENDING + stale lastSyncAt — regenerates token, resends', async () => {
      const stale = new Date(Date.now() - 120_000);
      mockRepo.findByEmail.mockResolvedValue(
        createMockSubscriber({ id: 'p', status: 'PENDING', lastSyncAt: stale }),
      );
      mockRepo.update.mockResolvedValue(
        createMockSubscriber({ id: 'p', status: 'PENDING' }),
      );

      await service.subscribe({ email: 'jane@example.com' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'p',
        expect.objectContaining({ syncState: 'PENDING_SYNC' }),
      );
      expect(mockMail.send).toHaveBeenCalled();
    });

    it('(4) CONFIRMED — idempotent no-op', async () => {
      mockRepo.findByEmail.mockResolvedValue(
        createMockSubscriber({ status: 'CONFIRMED' }),
      );

      await service.subscribe({ email: 'jane@example.com' });

      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(mockQueue.enqueueUpsert).not.toHaveBeenCalled();
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('(5) UNSUBSCRIBED — flips to PENDING + new token + enqueue', async () => {
      mockRepo.findByEmail.mockResolvedValue(
        createMockSubscriber({ id: 'u', status: 'UNSUBSCRIBED' }),
      );
      mockRepo.update.mockResolvedValue(
        createMockSubscriber({ id: 'u', status: 'PENDING' }),
      );

      await service.subscribe({ email: 'jane@example.com' });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'u',
        expect.objectContaining({ status: 'PENDING', unsubscribedAt: null }),
      );
      expect(mockQueue.enqueueUpsert).toHaveBeenCalled();
      expect(mockMail.send).toHaveBeenCalled();
    });

    it('(6) normalizes email + tags (lowercase + dedup)', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(createMockSubscriber({ id: 'sub' }));

      await service.subscribe({
        email: '  JANE@Example.com  ',
        tags: ['VIP', 'vip', 'vip ', 'Launch'],
      });

      expect(mockRepo.findByEmail).toHaveBeenCalledWith('jane@example.com');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          tags: ['vip', 'launch'],
        }),
        expect.anything(),
      );
    });

    it('(17) NEWSLETTER_DOUBLE_OPT_IN=false — subscribes as CONFIRMED, no email', async () => {
      service = build(false);
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(
        createMockSubscriber({ status: 'CONFIRMED' }),
      );

      await service.subscribe({ email: 'jane@example.com' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CONFIRMED',
          confirmationToken: null,
        }),
        expect.anything(),
      );
      expect(mockMail.send).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('(7) valid PENDING token → CONFIRMED + clears token', async () => {
      mockRepo.findRawByConfirmationToken.mockResolvedValue({
        id: 'p',
        status: 'PENDING',
      });
      mockRepo.update.mockResolvedValue(createMockSubscriber({ id: 'p' }));

      await expect(service.confirm('t')).resolves.toBe('CONFIRMED');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'p',
        expect.objectContaining({
          status: 'CONFIRMED',
          confirmationToken: null,
        }),
        expect.anything(),
      );
    });

    it('(8) CONFIRMED token → ALREADY_CONFIRMED', async () => {
      mockRepo.findRawByConfirmationToken.mockResolvedValue({
        id: 'c',
        status: 'CONFIRMED',
      });
      await expect(service.confirm('t')).resolves.toBe('ALREADY_CONFIRMED');
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('(9) missing token → INVALID_TOKEN (no throw)', async () => {
      mockRepo.findRawByConfirmationToken.mockResolvedValue(null);
      await expect(service.confirm('t')).resolves.toBe('INVALID_TOKEN');
    });

    it('(10) UNSUBSCRIBED token → INVALID_TOKEN', async () => {
      mockRepo.findRawByConfirmationToken.mockResolvedValue({
        id: 'u',
        status: 'UNSUBSCRIBED',
      });
      await expect(service.confirm('t')).resolves.toBe('INVALID_TOKEN');
    });
  });

  describe('unsubscribe', () => {
    it('(11) email + valid token → UNSUBSCRIBED + queue', async () => {
      const sub = createMockSubscriber({ id: 'x', status: 'CONFIRMED' });
      mockRepo.findByEmail.mockResolvedValue(sub);
      mockRepo.findRawByConfirmationToken.mockResolvedValue({
        id: 'x',
        status: 'CONFIRMED',
      });
      mockRepo.update.mockResolvedValue(sub);

      await service.unsubscribe({ email: sub.email, token: 'a'.repeat(64) });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'x',
        expect.objectContaining({ status: 'UNSUBSCRIBED' }),
        expect.anything(),
      );
      expect(mockQueue.enqueueUnsubscribe).toHaveBeenCalledWith({
        email: sub.email,
      });
    });

    it('(12) email only → sends tokenized email, no status change', async () => {
      const sub = createMockSubscriber({ id: 'x', status: 'CONFIRMED' });
      mockRepo.findByEmail.mockResolvedValue(sub);
      mockRepo.update.mockResolvedValue(sub);

      await service.unsubscribe({ email: sub.email });

      expect(mockMail.send).toHaveBeenCalled();
      expect(mockQueue.enqueueUnsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('(13) unsubscribe — flips row', async () => {
      const sub = createMockSubscriber({ id: 's', status: 'CONFIRMED' });
      mockRepo.findByEmail.mockResolvedValue(sub);
      mockRepo.update.mockResolvedValue(sub);

      const evt: VerifiedNewsletterWebhook = {
        eventId: 'e',
        type: 'unsubscribe',
        email: sub.email,
      };
      await service.handleWebhook('mailchimp', evt);

      expect(mockRepo.update).toHaveBeenCalledWith(
        's',
        expect.objectContaining({ status: 'UNSUBSCRIBED' }),
      );
    });

    it('(14) confirmed — flips PENDING only', async () => {
      const sub = createMockSubscriber({ id: 's', status: 'PENDING' });
      mockRepo.findByEmail.mockResolvedValue(sub);
      mockRepo.update.mockResolvedValue(sub);

      const evt: VerifiedNewsletterWebhook = {
        eventId: 'e',
        type: 'confirmed',
        email: sub.email,
      };
      await service.handleWebhook('mailchimp', evt);
      expect(mockRepo.update).toHaveBeenCalledWith(
        's',
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
    });

    it('(15) unknown email → void, no throw', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      const evt: VerifiedNewsletterWebhook = {
        eventId: 'e',
        type: 'unsubscribe',
        email: 'unknown@x.com',
      };
      await expect(
        service.handleWebhook('mailchimp', evt),
      ).resolves.toBeUndefined();
      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('forceResync', () => {
    it('(16) Conflict when row.provider !== bound provider name', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockSubscriber({ id: 's', provider: 'klaviyo' }),
      );
      await expect(service.forceResync('s')).rejects.toThrow(ConflictException);
    });

    it('passes when provider matches', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockSubscriber({ id: 's', provider: 'mailchimp' }),
      );
      mockRepo.update.mockResolvedValue(
        createMockSubscriber({
          id: 's',
          provider: 'mailchimp',
          syncState: 'PENDING_SYNC',
        }),
      );

      await service.forceResync('s');
      expect(mockQueue.enqueueUpsert).toHaveBeenCalledWith({
        subscriberId: 's',
      });
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when missing', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
