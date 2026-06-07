import type { LoggerService } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';

import type { AuthService } from '@/modules/auth/auth.service';
import type { UserEntity } from '@/modules/auth/entities/user.entity';

import {
  createMockConversation,
  createMockMessage,
} from '../../../test/factories/chat.factory';

import { ChatGateway } from './chat.gateway';
import type { ChatService } from './chat.service';

const mockService = {
  findById: jest.fn(),
  assertOwnership: jest.fn(),
  sendMessageAsCustomer: jest.fn(),
  sendMessageAsAdmin: jest.fn(),
  markRead: jest.fn(),
};

const mockJwt = { verifyAsync: jest.fn() };
const mockAuth = { validateUser: jest.fn() };
const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

const customerUser: UserEntity = {
  id: 'user-1',
  email: 'a@a.com',
  role: UserRole.CUSTOMER,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const adminUser: UserEntity = {
  id: 'admin-1',
  email: 'admin@a.com',
  role: UserRole.ADMIN,
  passwordHash: 'h',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

interface FakeSocket {
  id: string;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  data: Record<string, unknown>;
  join: jest.Mock;
  disconnect: jest.Mock;
}

function makeSocket(
  handshake: Partial<FakeSocket['handshake']> = {},
): FakeSocket {
  return {
    id: 'sock-1',
    handshake: {
      auth: handshake.auth ?? {},
      headers: handshake.headers ?? {},
    },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeServer(): { to: jest.Mock; emit: jest.Mock } {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(() => {
    gateway = new ChatGateway(
      mockService as unknown as ChatService,
      mockJwt as unknown as JwtService,
      mockAuth as unknown as AuthService,
      mockLogger as unknown as LoggerService,
    );
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('disconnects when no token + no session is provided', async () => {
      const socket = makeSocket();

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.data.identity).toBeUndefined();
    });

    it('valid JWT (CUSTOMER) attaches identity and does NOT join admin', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'a@a.com',
        role: UserRole.CUSTOMER,
      });
      mockAuth.validateUser.mockResolvedValue(customerUser);
      const socket = makeSocket({ auth: { token: 't' } });

      await gateway.handleConnection(socket as never);

      expect(socket.data.user).toBe(customerUser);
      expect(socket.data.identity).toEqual({ type: 'user', id: 'user-1' });
      expect(socket.join).not.toHaveBeenCalledWith('admin');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('valid JWT (ADMIN) joins admin room', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'admin-1',
        email: 'admin@a.com',
        role: UserRole.ADMIN,
      });
      mockAuth.validateUser.mockResolvedValue(adminUser);
      const socket = makeSocket({ auth: { token: 't' } });

      await gateway.handleConnection(socket as never);

      expect(socket.join).toHaveBeenCalledWith('admin');
    });

    it('guest session attaches guest identity and does NOT join admin', async () => {
      const socket = makeSocket({ auth: { session: 'sess-abc' } });

      await gateway.handleConnection(socket as never);

      expect(socket.data.identity).toEqual({ type: 'guest', id: 'sess-abc' });
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('onJoin', () => {
    it('customer ownership rejection returns { ok: false } and does not join', async () => {
      const socket = makeSocket();
      socket.data.identity = { type: 'user', id: 'user-1' };
      mockService.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'other-user' }),
      );
      mockService.assertOwnership.mockImplementation(() => {
        throw new Error('not yours');
      });

      const result = await gateway.onJoin(socket as never, {
        conversationId: 'c1',
      });

      expect(result.ok).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('admin can join any conversation room regardless of ownership', async () => {
      const socket = makeSocket();
      socket.data.identity = { type: 'user', id: 'admin-1' };
      socket.data.user = adminUser;
      mockService.findById.mockResolvedValue(
        createMockConversation({ id: 'c1', customerId: 'other-user' }),
      );

      const result = await gateway.onJoin(socket as never, {
        conversationId: 'c1',
      });

      expect(result.ok).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('customer:c1');
      expect(mockService.assertOwnership).not.toHaveBeenCalled();
    });
  });

  describe('onSend', () => {
    it('customer path emits to both admin and customer rooms', async () => {
      const socket = makeSocket();
      socket.data.identity = { type: 'user', id: 'user-1' };
      const message = createMockMessage({ id: 'm1', conversationId: 'c1' });
      const envelope = {
        rooms: ['admin', 'customer:c1'] as const,
        event: 'message:new' as const,
        payload: message,
      };
      mockService.sendMessageAsCustomer.mockResolvedValue({
        message,
        envelope,
      });
      const server = makeServer();
      gateway.server = server as never;

      const ack = await gateway.onSend(socket as never, {
        conversationId: 'c1',
        body: 'hi',
      });

      expect(ack).toEqual({ ok: true, messageId: 'm1' });
      expect(server.to).toHaveBeenCalledWith('admin');
      expect(server.to).toHaveBeenCalledWith('customer:c1');
      expect(server.emit).toHaveBeenCalledWith('message:new', message);
    });
  });
});
