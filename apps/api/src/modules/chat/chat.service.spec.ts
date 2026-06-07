import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { CartIdentity } from '@/modules/cart/cart.service';
import type { PrismaService } from '@/prisma/prisma.service';

import {
  createMockConversation,
  createMockMessage,
} from '../../../test/factories/chat.factory';

import type { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

const mockRepo: jest.Mocked<
  Pick<
    ChatRepository,
    | 'createConversation'
    | 'findOpenConversationByIdentity'
    | 'findLatestConversationByIdentity'
    | 'findById'
    | 'createMessage'
    | 'updateConversation'
    | 'listMessages'
    | 'markAllRead'
    | 'listForAdmin'
    | 'countUnread'
  >
> = {
  createConversation: jest.fn(),
  findOpenConversationByIdentity: jest.fn(),
  findLatestConversationByIdentity: jest.fn(),
  findById: jest.fn(),
  createMessage: jest.fn(),
  updateConversation: jest.fn(),
  listMessages: jest.fn(),
  markAllRead: jest.fn(),
  listForAdmin: jest.fn(),
  countUnread: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(
    async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      cb({} as Prisma.TransactionClient),
  ),
};

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

const userIdentity: CartIdentity = { type: 'user', id: 'user-1' };

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    service = new ChatService(
      mockRepo as unknown as ChatRepository,
      mockPrisma as unknown as PrismaService,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
    mockPrisma.$transaction.mockImplementation(
      async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>) =>
        cb({} as Prisma.TransactionClient),
    );
  });

  describe('getOrCreateMyConversation', () => {
    it('returns existing OPEN conversation when present (no create)', async () => {
      const existing = createMockConversation({ id: 'c1' });
      mockRepo.findOpenConversationByIdentity.mockResolvedValue(existing);

      const result = await service.getOrCreateMyConversation(userIdentity);

      expect(result).toBe(existing);
      expect(mockRepo.createConversation).not.toHaveBeenCalled();
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });

    it('creates conversation + SYSTEM welcome inside the same tx', async () => {
      mockRepo.findOpenConversationByIdentity.mockResolvedValue(null);
      const created = createMockConversation({ id: 'c-new' });
      mockRepo.createConversation.mockResolvedValue(created);
      mockRepo.createMessage.mockResolvedValue(
        createMockMessage({ sender: 'SYSTEM' }),
      );

      const result = await service.getOrCreateMyConversation(userIdentity);

      expect(result).toBe(created);
      expect(mockRepo.createConversation).toHaveBeenCalledWith(
        { customerId: 'user-1', guestSession: null },
        expect.anything(),
      );
      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'c-new',
          sender: 'SYSTEM',
          senderUserId: null,
        }),
        expect.anything(),
      );
    });

    it('throws BadRequest when identity is null', async () => {
      await expect(service.getOrCreateMyConversation(null)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findMyConversation', () => {
    it('throws NotFound when no conversation exists', async () => {
      mockRepo.findLatestConversationByIdentity.mockResolvedValue(null);

      await expect(service.findMyConversation(userIdentity)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the latest conversation (any status)', async () => {
      const closed = createMockConversation({ id: 'c-old', status: 'CLOSED' });
      mockRepo.findLatestConversationByIdentity.mockResolvedValue(closed);

      const result = await service.findMyConversation(userIdentity);

      expect(result).toBe(closed);
    });
  });

  describe('sendMessageAsCustomer', () => {
    it('persists row + updates lastMessageAt; envelope rooms = both', async () => {
      const conv = createMockConversation({
        id: 'c1',
        customerId: 'user-1',
      });
      mockRepo.findById.mockResolvedValue(conv);
      const msg = createMockMessage({ id: 'm1', conversationId: 'c1' });
      mockRepo.createMessage.mockResolvedValue(msg);

      const result = await service.sendMessageAsCustomer(
        userIdentity,
        'c1',
        'hello',
      );

      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'c1',
          sender: 'CUSTOMER',
          senderUserId: 'user-1',
          body: 'hello',
        }),
        expect.anything(),
      );
      expect(mockRepo.updateConversation).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ lastMessageAt: expect.any(Date) }),
        expect.anything(),
      );
      expect(result.envelope.rooms).toEqual(['admin', 'customer:c1']);
      expect(result.envelope.event).toBe('message:new');
    });

    it('throws BadRequest on whitespace-only body', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'user-1' }),
      );

      await expect(
        service.sendMessageAsCustomer(userIdentity, 'c1', '   '),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });

    it('throws BadRequest when conversation is CLOSED', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({
          id: 'c1',
          customerId: 'user-1',
          status: 'CLOSED',
        }),
      );

      await expect(
        service.sendMessageAsCustomer(userIdentity, 'c1', 'hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Forbidden when identity does not own the conversation', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'other-user' }),
      );

      await expect(
        service.sendMessageAsCustomer(userIdentity, 'c1', 'hello'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sendMessageAsAdmin', () => {
    it('persists row with sender=ADMIN, senderUserId=adminUserId', async () => {
      mockRepo.findById.mockResolvedValue(createMockConversation({ id: 'c1' }));
      mockRepo.createMessage.mockResolvedValue(
        createMockMessage({ id: 'm1', sender: 'ADMIN' }),
      );

      await service.sendMessageAsAdmin('admin-1', 'c1', 'hi');

      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: 'ADMIN',
          senderUserId: 'admin-1',
          body: 'hi',
        }),
        expect.anything(),
      );
    });

    it('throws BadRequest when conversation is CLOSED', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', status: 'CLOSED' }),
      );

      await expect(
        service.sendMessageAsAdmin('admin-1', 'c1', 'hi'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markRead', () => {
    it('customer path asserts ownership and calls repo with who=customer', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'user-1' }),
      );
      mockRepo.markAllRead.mockResolvedValue(2);

      await service.markRead('c1', 'customer', userIdentity);

      expect(mockRepo.markAllRead).toHaveBeenCalledWith('c1', 'customer');
    });

    it('admin path skips ownership and calls repo with who=admin', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'other-user' }),
      );
      mockRepo.markAllRead.mockResolvedValue(3);

      await service.markRead('c1', 'admin');

      expect(mockRepo.markAllRead).toHaveBeenCalledWith('c1', 'admin');
    });
  });

  describe('updateStatus', () => {
    it('OPEN→CLOSED inserts SYSTEM message + patches; envelope event = conversation:updated', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', status: 'OPEN' }),
      );
      mockRepo.updateConversation.mockResolvedValue(
        createMockConversation({ id: 'c1', status: 'CLOSED' }),
      );

      const result = await service.updateStatus('c1', { status: 'CLOSED' });

      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'c1',
          sender: 'SYSTEM',
          body: 'Conversation closed by support.',
        }),
        expect.anything(),
      );
      expect(mockRepo.updateConversation).toHaveBeenCalledWith(
        'c1',
        { status: 'CLOSED' },
        expect.anything(),
      );
      expect(result.envelope.event).toBe('conversation:updated');
      expect(result.envelope.rooms).toEqual(['admin', 'customer:c1']);
    });

    it('subject-only update does NOT insert SYSTEM message', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', status: 'OPEN' }),
      );
      mockRepo.updateConversation.mockResolvedValue(
        createMockConversation({ id: 'c1', subject: 'New' }),
      );

      await service.updateStatus('c1', { subject: 'New' });

      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('with customer identity asserts ownership BEFORE listing', async () => {
      mockRepo.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'other-user' }),
      );

      await expect(
        service.getMessages('c1', { limit: 50 }, userIdentity),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.listMessages).not.toHaveBeenCalled();
    });

    it('without identity (admin) just 404-checks then lists', async () => {
      mockRepo.findById.mockResolvedValue(createMockConversation({ id: 'c1' }));
      mockRepo.listMessages.mockResolvedValue([]);

      await service.getMessages('c1', { limit: 25 });

      expect(mockRepo.listMessages).toHaveBeenCalledWith('c1', { limit: 25 });
    });
  });
});
