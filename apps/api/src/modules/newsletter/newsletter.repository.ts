import { Injectable } from '@nestjs/common';
import type {
  NewsletterSubscriber as PrismaNewsletterSubscriber,
  Prisma,
} from '@prisma/client';

import type {
  NewsletterStatus,
  NewsletterSyncState,
  PaginatedResponse,
} from '@repo/types';

import { PrismaService } from '@/prisma/prisma.service';

import { NewsletterSubscriberEntity } from './entities/newsletter-subscriber.entity';

interface CreateData {
  email: string;
  source: PrismaNewsletterSubscriber['source'];
  locale: string | null;
  tags: string[];
  status: NewsletterStatus;
  confirmationToken: string | null;
  confirmedAt: Date | null;
  syncState: NewsletterSyncState;
}

interface UpdatePatch {
  status?: NewsletterStatus;
  syncState?: NewsletterSyncState;
  confirmationToken?: string | null;
  confirmedAt?: Date | null;
  unsubscribedAt?: Date | null;
  providerSubscriberId?: string | null;
  provider?: string | null;
  lastSyncAt?: Date | null;
  lastSyncError?: string | null;
  tags?: string[];
  locale?: string | null;
}

export interface ListForAdminFilters {
  status?: NewsletterStatus;
  syncState?: NewsletterSyncState;
  provider?: string;
  search?: string;
}

/**
 * Owns every Prisma call for newsletter subscribers. Services never touch
 * PrismaService directly. Every mutating method accepts `tx?:
 * Prisma.TransactionClient` so callers can compose multi-step writes.
 */
@Injectable()
export class NewsletterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<NewsletterSubscriberEntity> {
    const client = tx ?? this.prisma;
    const row = await client.newsletterSubscriber.create({
      data: {
        email: data.email,
        source: data.source,
        locale: data.locale,
        tags: data.tags,
        status: data.status,
        confirmationToken: data.confirmationToken,
        confirmedAt: data.confirmedAt,
        syncState: data.syncState,
      },
    });
    return this.toEntity(row);
  }

  async findById(id: string): Promise<NewsletterSubscriberEntity | null> {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<NewsletterSubscriberEntity | null> {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    });
    return row ? this.toEntity(row) : null;
  }

  /** Returns the raw row INCLUDING confirmationToken — only the service uses this
   *  inside the confirm() $transaction. Never expose this method's return value. */
  async findRawByConfirmationToken(
    token: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; status: NewsletterStatus } | null> {
    const client = tx ?? this.prisma;
    const row = await client.newsletterSubscriber.findFirst({
      where: { confirmationToken: token },
      select: { id: true, status: true },
    });
    return row;
  }

  async update(
    id: string,
    patch: UpdatePatch,
    tx?: Prisma.TransactionClient,
  ): Promise<NewsletterSubscriberEntity> {
    const client = tx ?? this.prisma;
    const row = await client.newsletterSubscriber.update({
      where: { id },
      data: patch,
    });
    return this.toEntity(row);
  }

  async markUnsubscribed(
    email: string,
    tx?: Prisma.TransactionClient,
  ): Promise<NewsletterSubscriberEntity | null> {
    const client = tx ?? this.prisma;
    const row = await client.newsletterSubscriber.findUnique({
      where: { email },
    });
    if (!row) return null;
    const updated = await client.newsletterSubscriber.update({
      where: { id: row.id },
      data: {
        status: 'UNSUBSCRIBED',
        unsubscribedAt: new Date(),
        confirmationToken: null,
      },
    });
    return this.toEntity(updated);
  }

  async listForAdmin(
    filters: ListForAdminFilters,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResponse<NewsletterSubscriberEntity>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NewsletterSubscriberWhereInput = {};
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.syncState !== undefined) where.syncState = filters.syncState;
    if (filters.provider !== undefined) where.provider = filters.provider;
    if (filters.search !== undefined && filters.search.length > 0) {
      where.email = { contains: filters.search, mode: 'insensitive' };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return { data: rows.map((r) => this.toEntity(r)), total, page, limit };
  }

  async remove(id: string): Promise<void> {
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
  }

  private toEntity(
    row: PrismaNewsletterSubscriber,
  ): NewsletterSubscriberEntity {
    const e = new NewsletterSubscriberEntity();
    e.id = row.id;
    e.email = row.email;
    e.status = row.status;
    e.source = row.source;
    e.locale = row.locale;
    e.tags = row.tags;
    e.providerSubscriberId = row.providerSubscriberId;
    e.provider = row.provider;
    e.syncState = row.syncState;
    e.lastSyncAt = row.lastSyncAt;
    e.lastSyncError = row.lastSyncError;
    e.confirmedAt = row.confirmedAt;
    e.unsubscribedAt = row.unsubscribedAt;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
