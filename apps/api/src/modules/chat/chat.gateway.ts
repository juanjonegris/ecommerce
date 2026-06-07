import { Inject, type LoggerService } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { Server, Socket } from 'socket.io';

import { AuthService } from '@/modules/auth/auth.service';
import type { UserEntity } from '@/modules/auth/entities/user.entity';
import type { JwtPayload } from '@/modules/auth/jwt-payload';
import type { CartIdentity } from '@/modules/cart/cart.service';

import { ChatService, type BroadcastEnvelope } from './chat.service';

interface SocketData {
  user?: UserEntity;
  identity?: CartIdentity;
}

/**
 * Real-time chat transport. Socket.io CORS is configured here because
 * `app.enableCors` in main.ts does NOT apply to the WebSocket namespace.
 * `origin: true` accepts any origin in dev; tighten in production by passing
 * the same CORS_ORIGINS list main.ts uses.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly service: ChatService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const handshakeAuth = socket.handshake.auth as
        | { token?: unknown; session?: unknown }
        | undefined;
      const tokenFromAuth =
        typeof handshakeAuth?.token === 'string' ? handshakeAuth.token : null;
      const token =
        tokenFromAuth ??
        this.bearerFromHeader(socket.handshake.headers.authorization);

      if (token) {
        const payload = await this.jwt.verifyAsync<JwtPayload>(token);
        const user = await this.auth.validateUser(payload);
        if (!user) throw new Error('invalid_token');
        const data = socket.data as SocketData;
        data.user = user;
        data.identity = { type: 'user', id: user.id };
        if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
          await socket.join('admin');
        }
        this.logger.log({
          message: 'chat.gateway.connection_authenticated',
          socketId: socket.id,
          userId: user.id,
          role: user.role,
        });
        return;
      }

      const session =
        typeof handshakeAuth?.session === 'string'
          ? handshakeAuth.session
          : null;
      if (session) {
        const data = socket.data as SocketData;
        data.identity = { type: 'guest', id: session };
        this.logger.log({
          message: 'chat.gateway.connection_authenticated',
          socketId: socket.id,
          guest: true,
        });
        return;
      }

      throw new Error('no_credentials');
    } catch (err) {
      this.logger.warn({
        message: 'chat.gateway.connection_rejected',
        socketId: socket.id,
        reason: (err as Error).message,
      });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    this.logger.log({
      message: 'chat.gateway.disconnected',
      socketId: socket.id,
    });
  }

  @SubscribeMessage('conversation:join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const data = socket.data as SocketData;
      const identity = data.identity;
      const user = data.user;
      if (!identity) throw new Error('not_authenticated');
      const conv = await this.service.findById(body.conversationId);
      const isAdmin =
        user !== undefined &&
        (user.role === UserRole.ADMIN || user.role === UserRole.STAFF);
      if (!isAdmin) {
        this.service.assertOwnership(conv, identity);
      }
      await socket.join(`customer:${body.conversationId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; body: string },
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    try {
      const data = socket.data as SocketData;
      const identity = data.identity;
      const user = data.user;
      if (!identity) throw new Error('not_authenticated');
      const isAdmin =
        user !== undefined &&
        (user.role === UserRole.ADMIN || user.role === UserRole.STAFF);
      const result = isAdmin
        ? await this.service.sendMessageAsAdmin(
            user.id,
            body.conversationId,
            body.body,
          )
        : await this.service.sendMessageAsCustomer(
            identity,
            body.conversationId,
            body.body,
          );
      this.broadcast(result.envelope);
      return { ok: true, messageId: result.message.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:read')
  async onRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const data = socket.data as SocketData;
      const identity = data.identity;
      const user = data.user;
      if (!identity) throw new Error('not_authenticated');
      const isAdmin =
        user !== undefined &&
        (user.role === UserRole.ADMIN || user.role === UserRole.STAFF);
      await this.service.markRead(
        body.conversationId,
        isAdmin ? 'admin' : 'customer',
        isAdmin ? undefined : identity,
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Public broadcaster used by both the controller (after REST mutations) and
   * the gateway's own subscribers (after WS mutations). Iterates the envelope's
   * rooms and emits the event to each.
   */
  broadcast<T>(envelope: BroadcastEnvelope<T>): void {
    for (const room of envelope.rooms) {
      this.server.to(room).emit(envelope.event, envelope.payload);
    }
  }

  private bearerFromHeader(
    header: string | string[] | undefined,
  ): string | null {
    if (!header || Array.isArray(header)) return null;
    return header.startsWith('Bearer ') ? header.slice(7) : null;
  }
}
