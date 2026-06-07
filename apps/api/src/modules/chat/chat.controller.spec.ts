import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserEntity } from '@/modules/auth/entities/user.entity';

import {
  createMockConversation,
  createMockMessage,
} from '../../../test/factories/chat.factory';

import { ChatController } from './chat.controller';
import type { ChatGateway } from './chat.gateway';
import type { ChatService } from './chat.service';

const mockService = {
  getOrCreateMyConversation: jest.fn(),
  findMyConversation: jest.fn(),
  listForAdmin: jest.fn(),
  findById: jest.fn(),
  getMessages: jest.fn(),
  sendMessageAsCustomer: jest.fn(),
  sendMessageAsAdmin: jest.fn(),
  markRead: jest.fn(),
  updateStatus: jest.fn(),
};

const mockGateway = { broadcast: jest.fn() };

const customer: UserEntity = {
  id: 'user-1',
  email: 'a@a.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const admin: UserEntity = {
  id: 'admin-1',
  email: 'admin@a.com',
  role: UserRole.ADMIN,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(() => {
    controller = new ChatController(
      mockService as unknown as ChatService,
      mockGateway as unknown as ChatGateway,
    );
    jest.clearAllMocks();
  });

  describe('getMyConversation', () => {
    it('resolves user identity when JWT user present', async () => {
      mockService.getOrCreateMyConversation.mockResolvedValue(
        createMockConversation({ id: 'c1' }),
      );
      mockService.getMessages.mockResolvedValue([]);

      await controller.getMyConversation(customer, undefined);

      expect(mockService.getOrCreateMyConversation).toHaveBeenCalledWith({
        type: 'user',
        id: 'user-1',
      });
    });

    it('falls back to guest identity from x-cart-session', async () => {
      mockService.getOrCreateMyConversation.mockResolvedValue(
        createMockConversation({ id: 'c1' }),
      );
      mockService.getMessages.mockResolvedValue([]);

      await controller.getMyConversation(undefined, 'sess-abc');

      expect(mockService.getOrCreateMyConversation).toHaveBeenCalledWith({
        type: 'guest',
        id: 'sess-abc',
      });
    });

    it('throws BadRequest when no user and no session', async () => {
      await expect(
        controller.getMyConversation(undefined, undefined),
      ).rejects.toThrow(BadRequestException);
      expect(mockService.getOrCreateMyConversation).not.toHaveBeenCalled();
    });
  });

  describe('sendMyMessage', () => {
    it('invokes gateway.broadcast with the service envelope', async () => {
      mockService.findMyConversation.mockResolvedValue(
        createMockConversation({ id: 'c1' }),
      );
      const message = createMockMessage({ id: 'm1', conversationId: 'c1' });
      const envelope = {
        rooms: ['admin', 'customer:c1'],
        event: 'message:new',
        payload: message,
      };
      mockService.sendMessageAsCustomer.mockResolvedValue({
        message,
        envelope,
      });

      const result = await controller.sendMyMessage(customer, undefined, {
        body: 'hello',
      });

      expect(mockGateway.broadcast).toHaveBeenCalledWith(envelope);
      expect(result.id).toBe('m1');
    });
  });

  describe('reply (admin)', () => {
    it('passes user.id to sendMessageAsAdmin and broadcasts', async () => {
      const message = createMockMessage({ id: 'm2', sender: 'ADMIN' });
      const envelope = {
        rooms: ['admin', 'customer:c1'],
        event: 'message:new',
        payload: message,
      };
      mockService.sendMessageAsAdmin.mockResolvedValue({ message, envelope });

      await controller.reply(admin, 'c1', { body: 'hi' });

      expect(mockService.sendMessageAsAdmin).toHaveBeenCalledWith(
        'admin-1',
        'c1',
        'hi',
      );
      expect(mockGateway.broadcast).toHaveBeenCalledWith(envelope);
    });
  });

  describe('update (admin, status=CLOSED)', () => {
    it('broadcasts conversation:updated envelope', async () => {
      const conversation = createMockConversation({
        id: 'c1',
        status: 'CLOSED',
      });
      const envelope = {
        rooms: ['admin', 'customer:c1'],
        event: 'conversation:updated',
        payload: conversation,
      };
      mockService.updateStatus.mockResolvedValue({ conversation, envelope });

      await controller.update('c1', { status: 'CLOSED' });

      expect(mockGateway.broadcast).toHaveBeenCalledWith(envelope);
    });
  });
});
