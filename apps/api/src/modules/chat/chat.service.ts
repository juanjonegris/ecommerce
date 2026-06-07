import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { PaginatedResponse } from '@repo/types';

import type { CartIdentity } from '@/modules/cart/cart.service';
import { PrismaService } from '@/prisma/prisma.service';

import { ChatRepository, type AdminConversationRow } from './chat.repository';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import type { ConversationEntity } from './entities/conversation.entity';
import type { MessageEntity } from './entities/message.entity';

export interface BroadcastEnvelope<TPayload> {
  rooms: string[];
  event: 'message:new' | 'conversation:updated' | 'conversation:new';
  payload: TPayload;
}

interface IdentityWhere {
  customerId: string | null;
  guestSession: string | null;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Throws BadRequest when no identity is resolvable, else narrows the
   * identity to a non-null union AND returns a Prisma-friendly
   * `{ customerId, guestSession }` pair. Prisma cannot express the XOR
   * constraint at the DB level, so this is the contract.
   */
  assertIdentity(
    identity: CartIdentity | null,
  ): asserts identity is CartIdentity {
    if (!identity) {
      throw new BadRequestException(
        'Missing auth token or x-cart-session header',
      );
    }
  }

  private identityToWhere(identity: CartIdentity): IdentityWhere {
    return {
      customerId: identity.type === 'user' ? identity.id : null,
      guestSession: identity.type === 'guest' ? identity.id : null,
    };
  }

  assertOwnership(
    conversation: ConversationEntity,
    identity: CartIdentity,
  ): void {
    const owns =
      (identity.type === 'user' && conversation.customerId === identity.id) ||
      (identity.type === 'guest' && conversation.guestSession === identity.id);
    if (!owns) {
      throw new ForbiddenException('Not your conversation');
    }
  }

  async getOrCreateMyConversation(
    identity: CartIdentity | null,
  ): Promise<ConversationEntity> {
    this.assertIdentity(identity);
    const where = this.identityToWhere(identity);
    const requestId = this.cls.getId();

    return this.prisma.$transaction(async (tx) => {
      const open = await this.repository.findOpenConversationByIdentity(
        where,
        tx,
      );
      if (open) return open;

      const created = await this.repository.createConversation(where, tx);
      await this.repository.createMessage(
        {
          conversationId: created.id,
          sender: 'SYSTEM',
          senderUserId: null,
          body: 'Welcome! How can we help?',
        },
        tx,
      );
      this.logger.log({
        message: 'chat.service.conversation_created',
        requestId,
        conversationId: created.id,
        identity: identity.type,
      });
      return created;
    });
  }

  async findMyConversation(
    identity: CartIdentity | null,
  ): Promise<ConversationEntity> {
    this.assertIdentity(identity);
    const where = this.identityToWhere(identity);
    const latest =
      await this.repository.findLatestConversationByIdentity(where);
    if (!latest) {
      throw new NotFoundException('No conversation found');
    }
    return latest;
  }

  async listForAdmin(filters: {
    status?: 'OPEN' | 'CLOSED';
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<AdminConversationRow>> {
    return this.repository.listForAdmin(filters);
  }

  async findById(id: string): Promise<ConversationEntity> {
    const conv = await this.repository.findById(id);
    if (!conv) {
      throw new NotFoundException(`Conversation "${id}" not found`);
    }
    return conv;
  }

  async getMessages(
    conversationId: string,
    query: { cursor?: string; limit?: number },
    identity?: CartIdentity,
  ): Promise<MessageEntity[]> {
    const limit = query.limit ?? 50;
    if (identity) {
      const conv = await this.findById(conversationId);
      this.assertOwnership(conv, identity);
    } else {
      // Admin path — still 404 if the conversation doesn't exist.
      await this.findById(conversationId);
    }
    return this.repository.listMessages(conversationId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit,
    });
  }

  async sendMessageAsCustomer(
    identity: CartIdentity | null,
    conversationId: string,
    body: string,
  ): Promise<{
    message: MessageEntity;
    envelope: BroadcastEnvelope<MessageEntity>;
  }> {
    this.assertIdentity(identity);
    const conv = await this.findById(conversationId);
    this.assertOwnership(conv, identity);

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Body is empty');
    }
    if (conv.status === 'CLOSED') {
      throw new BadRequestException('Conversation is closed');
    }

    const requestId = this.cls.getId();
    const senderUserId = identity.type === 'user' ? identity.id : null;

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await this.repository.createMessage(
        {
          conversationId,
          sender: 'CUSTOMER',
          senderUserId,
          body: trimmed,
        },
        tx,
      );
      await this.repository.updateConversation(
        conversationId,
        { lastMessageAt: new Date() },
        tx,
      );
      return msg;
    });

    this.logger.log({
      message: 'chat.service.message_sent_succeeded',
      requestId,
      conversationId,
      messageId: message.id,
      sender: 'CUSTOMER',
    });

    return {
      message,
      envelope: {
        rooms: ['admin', `customer:${conversationId}`],
        event: 'message:new',
        payload: message,
      },
    };
  }

  async sendMessageAsAdmin(
    adminUserId: string,
    conversationId: string,
    body: string,
  ): Promise<{
    message: MessageEntity;
    envelope: BroadcastEnvelope<MessageEntity>;
  }> {
    const conv = await this.findById(conversationId);

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Body is empty');
    }
    if (conv.status === 'CLOSED') {
      throw new BadRequestException('Conversation is closed');
    }

    const requestId = this.cls.getId();

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await this.repository.createMessage(
        {
          conversationId,
          sender: 'ADMIN',
          senderUserId: adminUserId,
          body: trimmed,
        },
        tx,
      );
      await this.repository.updateConversation(
        conversationId,
        { lastMessageAt: new Date() },
        tx,
      );
      return msg;
    });

    this.logger.log({
      message: 'chat.service.message_sent_succeeded',
      requestId,
      conversationId,
      messageId: message.id,
      sender: 'ADMIN',
      adminUserId,
    });

    return {
      message,
      envelope: {
        rooms: ['admin', `customer:${conversationId}`],
        event: 'message:new',
        payload: message,
      },
    };
  }

  async markRead(
    conversationId: string,
    who: 'customer' | 'admin',
    identity?: CartIdentity,
  ): Promise<void> {
    const conv = await this.findById(conversationId);
    if (who === 'customer') {
      if (!identity) {
        throw new BadRequestException(
          'Identity required to mark customer read',
        );
      }
      this.assertOwnership(conv, identity);
    }
    const count = await this.repository.markAllRead(conversationId, who);
    this.logger.log({
      message: 'chat.service.mark_read_succeeded',
      requestId: this.cls.getId(),
      conversationId,
      who,
      count,
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateConversationDto,
  ): Promise<{
    conversation: ConversationEntity;
    envelope: BroadcastEnvelope<ConversationEntity>;
  }> {
    const current = await this.findById(id);
    const willClose = dto.status === 'CLOSED' && current.status === 'OPEN';

    const updated = await this.prisma.$transaction(async (tx) => {
      if (willClose) {
        await this.repository.createMessage(
          {
            conversationId: id,
            sender: 'SYSTEM',
            senderUserId: null,
            body: 'Conversation closed by support.',
          },
          tx,
        );
      }
      return this.repository.updateConversation(
        id,
        {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        },
        tx,
      );
    });

    this.logger.log({
      message: 'chat.service.update_status_succeeded',
      requestId: this.cls.getId(),
      conversationId: id,
      status: updated.status,
    });

    return {
      conversation: updated,
      envelope: {
        rooms: ['admin', `customer:${id}`],
        event: 'conversation:updated',
        payload: updated,
      },
    };
  }
}
