import { Injectable } from '@nestjs/common';
import type {
  Conversation as PrismaConversation,
  Message as PrismaMessage,
  Prisma,
} from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { PrismaService } from '@/prisma/prisma.service';

import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';

interface CreateConversationData {
  customerId: string | null;
  guestSession: string | null;
  subject?: string | null;
}

interface IdentityWhere {
  customerId: string | null;
  guestSession: string | null;
}

interface UpdateConversationPatch {
  status?: 'OPEN' | 'CLOSED';
  subject?: string | null;
  lastMessageAt?: Date;
}

interface CreateMessageData {
  conversationId: string;
  sender: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  senderUserId: string | null;
  body: string;
}

export interface AdminConversationRow {
  entity: ConversationEntity;
  preview: string | null;
  unreadForAdmin: number;
}

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    data: CreateConversationData,
    tx?: Prisma.TransactionClient,
  ): Promise<ConversationEntity> {
    const client = tx ?? this.prisma;
    const row = await client.conversation.create({
      data: {
        customerId: data.customerId,
        guestSession: data.guestSession,
        subject: data.subject ?? null,
      },
    });
    return this.toConversationEntity(row);
  }

  /**
   * Find the caller's currently OPEN conversation. The where clause keys off
   * whichever identity field is set (customerId for auth users; guestSession
   * for guests).
   */
  async findOpenConversationByIdentity(
    where: IdentityWhere,
    tx?: Prisma.TransactionClient,
  ): Promise<ConversationEntity | null> {
    const client = tx ?? this.prisma;
    const row = await client.conversation.findFirst({
      where: {
        status: 'OPEN',
        ...(where.customerId !== null
          ? { customerId: where.customerId }
          : { guestSession: where.guestSession }),
      },
    });
    return row ? this.toConversationEntity(row) : null;
  }

  /**
   * Most-recent conversation for this identity regardless of status — used by
   * `findMyConversation` so customers can view past correspondence.
   */
  async findLatestConversationByIdentity(
    where: IdentityWhere,
  ): Promise<ConversationEntity | null> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        ...(where.customerId !== null
          ? { customerId: where.customerId }
          : { guestSession: where.guestSession }),
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    return row ? this.toConversationEntity(row) : null;
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ConversationEntity | null> {
    const client = tx ?? this.prisma;
    const row = await client.conversation.findUnique({ where: { id } });
    return row ? this.toConversationEntity(row) : null;
  }

  async listForAdmin(filters: {
    status?: 'OPEN' | 'CLOSED';
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<AdminConversationRow>> {
    const { status, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { body: true },
          },
          _count: {
            select: {
              messages: {
                where: { sender: 'CUSTOMER', readByAdmin: false },
              },
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const data: AdminConversationRow[] = rows.map((r) => ({
      entity: this.toConversationEntity(r),
      preview: r.messages[0] ? r.messages[0].body.slice(0, 120) : null,
      unreadForAdmin: r._count.messages,
    }));
    return { data, total, page, limit };
  }

  async updateConversation(
    id: string,
    patch: UpdateConversationPatch,
    tx?: Prisma.TransactionClient,
  ): Promise<ConversationEntity> {
    const client = tx ?? this.prisma;
    const row = await client.conversation.update({
      where: { id },
      data: patch,
    });
    return this.toConversationEntity(row);
  }

  async createMessage(
    data: CreateMessageData,
    tx?: Prisma.TransactionClient,
  ): Promise<MessageEntity> {
    const client = tx ?? this.prisma;
    const row = await client.message.create({ data });
    return this.toMessageEntity(row);
  }

  async listMessages(
    conversationId: string,
    query: { cursor?: string; limit: number },
  ): Promise<MessageEntity[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return rows.map((r) => this.toMessageEntity(r));
  }

  async markAllRead(
    conversationId: string,
    who: 'customer' | 'admin',
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const oppositeSender = who === 'customer' ? 'ADMIN' : 'CUSTOMER';
    const readField = who === 'customer' ? 'readByCustomer' : 'readByAdmin';
    const result = await client.message.updateMany({
      where: {
        conversationId,
        sender: oppositeSender,
        [readField]: false,
      },
      data: { [readField]: true },
    });
    return result.count;
  }

  async countUnread(
    conversationId: string,
    who: 'customer' | 'admin',
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const oppositeSender = who === 'customer' ? 'ADMIN' : 'CUSTOMER';
    const readField = who === 'customer' ? 'readByCustomer' : 'readByAdmin';
    return client.message.count({
      where: {
        conversationId,
        sender: oppositeSender,
        [readField]: false,
      },
    });
  }

  private toConversationEntity(row: PrismaConversation): ConversationEntity {
    const e = new ConversationEntity();
    e.id = row.id;
    e.customerId = row.customerId;
    e.guestSession = row.guestSession;
    e.status = row.status;
    e.subject = row.subject;
    e.lastMessageAt = row.lastMessageAt;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }

  private toMessageEntity(row: PrismaMessage): MessageEntity {
    const e = new MessageEntity();
    e.id = row.id;
    e.conversationId = row.conversationId;
    e.sender = row.sender;
    e.senderUserId = row.senderUserId;
    e.body = row.body;
    e.readByCustomer = row.readByCustomer;
    e.readByAdmin = row.readByAdmin;
    e.createdAt = row.createdAt;
    return e;
  }
}
