import { randomBytes } from 'crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { NewsletterSource, PaginatedResponse } from '@repo/types';

import type { AppConfig } from '@/config/configuration';
import { MAIL_SERVICE, type MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';

import type { ConfirmResult } from './dto/confirm-response.dto';
import type { SubscribeDto } from './dto/subscribe.dto';
import type { UnsubscribeDto } from './dto/unsubscribe.dto';
import type { NewsletterSubscriberEntity } from './entities/newsletter-subscriber.entity';
import { NewsletterQueue } from './newsletter.queue.service';
import {
  NewsletterRepository,
  type ListForAdminFilters,
} from './newsletter.repository';
import {
  NEWSLETTER_PROVIDER,
  type NewsletterProviderAdapter,
  type VerifiedNewsletterWebhook,
} from './providers/newsletter-provider.interface';

const RATE_LIMIT_RESEND_MS = 60_000;

@Injectable()
export class NewsletterService {
  constructor(
    private readonly repository: NewsletterRepository,
    private readonly prisma: PrismaService,
    @Inject(NEWSLETTER_PROVIDER)
    private readonly provider: NewsletterProviderAdapter,
    private readonly queue: NewsletterQueue,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Anti-enumeration subscribe. Returns the same ACCEPTED shape regardless of
   * the underlying row state (plan D3). Branches:
   * - missing → create PENDING + enqueue + send email
   * - PENDING + recent → no-op (rate-limit)
   * - PENDING + stale → regenerate token + re-enqueue + resend
   * - CONFIRMED → no-op (idempotent)
   * - UNSUBSCRIBED → flip → PENDING + new token + enqueue + email
   */
  async subscribe(dto: SubscribeDto): Promise<void> {
    const requestId = this.cls.getId();
    const email = dto.email.trim().toLowerCase();
    const tags = normalizeTags(dto.tags ?? []);
    const source: NewsletterSource = dto.source ?? 'UNKNOWN';
    const doubleOptIn = this.doubleOptIn();

    this.logger.log({
      message: 'newsletter.service.subscribe_started',
      requestId,
      email,
    });

    const existing = await this.repository.findByEmail(email);

    if (!existing) {
      const token = doubleOptIn ? this.generateToken() : null;
      const created = await this.prisma.$transaction(async (tx) =>
        this.repository.create(
          {
            email,
            source,
            locale: dto.locale ?? null,
            tags,
            status: doubleOptIn ? 'PENDING' : 'CONFIRMED',
            confirmationToken: token,
            confirmedAt: doubleOptIn ? null : new Date(),
            syncState: 'PENDING_SYNC',
          },
          tx,
        ),
      );
      await this.queue.enqueueUpsert({ subscriberId: created.id });
      if (doubleOptIn && token !== null) {
        await this.sendConfirmationEmail(created, token);
      }
      this.logger.log({
        message: 'newsletter.service.subscribe_succeeded',
        requestId,
        subscriberId: created.id,
        status: created.status,
      });
      return;
    }

    if (existing.status === 'CONFIRMED') {
      this.logger.log({
        message: 'newsletter.service.subscribe_idempotent',
        requestId,
        subscriberId: existing.id,
      });
      return;
    }

    if (existing.status === 'PENDING') {
      if (
        existing.lastSyncAt !== null &&
        Date.now() - existing.lastSyncAt.getTime() < RATE_LIMIT_RESEND_MS
      ) {
        this.logger.log({
          message: 'newsletter.service.subscribe_rate_limited',
          requestId,
          subscriberId: existing.id,
        });
        return;
      }
      const token = this.generateToken();
      const updated = await this.repository.update(existing.id, {
        confirmationToken: token,
        syncState: 'PENDING_SYNC',
        lastSyncAt: new Date(),
      });
      await this.queue.enqueueUpsert({ subscriberId: updated.id });
      await this.sendConfirmationEmail(updated, token);
      this.logger.log({
        message: 'newsletter.service.subscribe_succeeded',
        requestId,
        subscriberId: updated.id,
        status: updated.status,
      });
      return;
    }

    // UNSUBSCRIBED → re-enroll
    const token = doubleOptIn ? this.generateToken() : null;
    const updated = await this.repository.update(existing.id, {
      status: doubleOptIn ? 'PENDING' : 'CONFIRMED',
      confirmationToken: token,
      confirmedAt: doubleOptIn ? null : new Date(),
      unsubscribedAt: null,
      syncState: 'PENDING_SYNC',
      tags,
      locale: dto.locale ?? existing.locale,
    });
    await this.queue.enqueueUpsert({ subscriberId: updated.id });
    if (doubleOptIn && token !== null) {
      await this.sendConfirmationEmail(updated, token);
    }
    this.logger.log({
      message: 'newsletter.service.subscribe_succeeded',
      requestId,
      subscriberId: updated.id,
      status: updated.status,
    });
  }

  /**
   * Atomic confirm. Plan D1 — find-then-update inside a $transaction. Never
   * throws; returns one of three explicit statuses so the storefront can render
   * a friendly page without surfacing 4xx.
   */
  async confirm(token: string): Promise<ConfirmResult> {
    const requestId = this.cls.getId();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.repository.findRawByConfirmationToken(token, tx);
      if (!row) {
        this.logger.log({
          message: 'newsletter.service.confirm_invalid_token',
          requestId,
        });
        return 'INVALID_TOKEN' satisfies ConfirmResult;
      }
      if (row.status === 'CONFIRMED') {
        this.logger.log({
          message: 'newsletter.service.confirm_already_confirmed',
          requestId,
          subscriberId: row.id,
        });
        return 'ALREADY_CONFIRMED' satisfies ConfirmResult;
      }
      if (row.status !== 'PENDING') {
        return 'INVALID_TOKEN' satisfies ConfirmResult;
      }
      await this.repository.update(
        row.id,
        {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmationToken: null,
        },
        tx,
      );
      this.logger.log({
        message: 'newsletter.service.confirm_succeeded',
        requestId,
        subscriberId: row.id,
      });
      return 'CONFIRMED' satisfies ConfirmResult;
    });
  }

  async unsubscribe(dto: UnsubscribeDto): Promise<void> {
    const requestId = this.cls.getId();
    const email = dto.email.trim().toLowerCase();
    const existing = await this.repository.findByEmail(email);

    if (!existing) {
      // Anti-enumeration: silently no-op (caller sees the same ACCEPTED shape).
      this.logger.log({
        message: 'newsletter.service.unsubscribe_unknown_email',
        requestId,
      });
      return;
    }

    if (dto.token !== undefined) {
      const token = dto.token;
      const tokenMatches = await this.prisma.$transaction(async (tx) => {
        const row = await this.repository.findRawByConfirmationToken(token, tx);
        if (!row || row.id !== existing.id) return false;
        await this.repository.update(
          row.id,
          {
            status: 'UNSUBSCRIBED',
            unsubscribedAt: new Date(),
            confirmationToken: null,
          },
          tx,
        );
        return true;
      });
      if (tokenMatches) {
        await this.queue.enqueueUnsubscribe({ email });
        this.logger.log({
          message: 'newsletter.service.unsubscribe_succeeded',
          requestId,
          subscriberId: existing.id,
        });
        return;
      }
      // Fall through to tokenized-email path on token mismatch.
    }

    // No token (or bad token) — issue a fresh one and email it.
    if (
      existing.lastSyncAt !== null &&
      Date.now() - existing.lastSyncAt.getTime() < RATE_LIMIT_RESEND_MS
    ) {
      this.logger.log({
        message: 'newsletter.service.unsubscribe_rate_limited',
        requestId,
        subscriberId: existing.id,
      });
      return;
    }
    const token = this.generateToken();
    const updated = await this.repository.update(existing.id, {
      confirmationToken: token,
      lastSyncAt: new Date(),
    });
    await this.sendUnsubscribeEmail(updated, token);
    this.logger.log({
      message: 'newsletter.service.unsubscribe_email_sent',
      requestId,
      subscriberId: updated.id,
    });
  }

  async handleWebhook(
    providerName: string,
    event: VerifiedNewsletterWebhook,
  ): Promise<void> {
    const requestId = this.cls.getId();
    const email = event.email.toLowerCase();
    const existing = await this.repository.findByEmail(email);
    if (!existing) {
      this.logger.log({
        message: 'newsletter.service.webhook_ignored',
        requestId,
        providerName,
        type: event.type,
        reason: 'unknown_email',
      });
      return;
    }

    if (
      event.type === 'unsubscribe' ||
      event.type === 'bounce' ||
      event.type === 'spam'
    ) {
      await this.repository.update(existing.id, {
        status: 'UNSUBSCRIBED',
        unsubscribedAt: new Date(),
        confirmationToken: null,
      });
    } else if (existing.status === 'PENDING') {
      // Only remaining branch — `event.type === 'confirmed'`.
      await this.repository.update(existing.id, {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmationToken: null,
      });
    }

    this.logger.log({
      message: 'newsletter.service.webhook_handled',
      requestId,
      providerName,
      type: event.type,
      subscriberId: existing.id,
    });
  }

  async findById(id: string): Promise<NewsletterSubscriberEntity> {
    const sub = await this.repository.findById(id);
    if (!sub) throw new NotFoundException(`Subscriber "${id}" not found`);
    return sub;
  }

  async listForAdmin(
    filters: ListForAdminFilters,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResponse<NewsletterSubscriberEntity>> {
    return this.repository.listForAdmin(filters, pagination);
  }

  async forceResync(id: string): Promise<NewsletterSubscriberEntity> {
    const requestId = this.cls.getId();
    const sub = await this.findById(id);
    if (sub.provider !== null && sub.provider !== this.provider.name) {
      throw new ConflictException(
        `Subscriber stamped for "${sub.provider}", currently bound to "${this.provider.name}". Migrate explicitly.`,
      );
    }
    const updated = await this.repository.update(id, {
      syncState: 'PENDING_SYNC',
      lastSyncError: null,
    });
    await this.queue.enqueueUpsert({ subscriberId: id });
    this.logger.log({
      message: 'newsletter.service.resync_enqueued',
      requestId,
      subscriberId: id,
    });
    return updated;
  }

  async forceUnsubscribe(id: string): Promise<NewsletterSubscriberEntity> {
    const sub = await this.findById(id);
    const updated = await this.repository.update(id, {
      status: 'UNSUBSCRIBED',
      unsubscribedAt: new Date(),
      confirmationToken: null,
    });
    await this.queue.enqueueUnsubscribe({ email: sub.email });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const requestId = this.cls.getId();
    const sub = await this.findById(id);
    await this.repository.remove(id);
    try {
      await this.provider.unsubscribe(sub.email);
    } catch (err) {
      this.logger.warn({
        message: 'newsletter.service.remove_provider_unsubscribe_failed',
        requestId,
        email: sub.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.logger.log({
      message: 'newsletter.service.remove_succeeded',
      requestId,
      subscriberId: id,
    });
  }

  private doubleOptIn(): boolean {
    return (
      this.config.get<AppConfig['NEWSLETTER_DOUBLE_OPT_IN']>(
        'NEWSLETTER_DOUBLE_OPT_IN',
      ) ?? true
    );
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async sendConfirmationEmail(
    sub: NewsletterSubscriberEntity,
    token: string,
  ): Promise<void> {
    const url = this.confirmUrl(sub.locale, token);
    await this.mail.send({
      to: sub.email,
      subject: 'Please confirm your newsletter subscription',
      html: `<p>Thanks for subscribing! Confirm your email by clicking the link below:</p><p><a href="${url}">Confirm subscription</a></p>`,
      text: `Confirm your email: ${url}`,
      requestId: this.cls.getId(),
    });
  }

  private async sendUnsubscribeEmail(
    sub: NewsletterSubscriberEntity,
    token: string,
  ): Promise<void> {
    const baseUrl =
      this.config.get<AppConfig['PUBLIC_WEB_URL']>('PUBLIC_WEB_URL') ??
      'http://localhost:3000';
    const locale = sub.locale ?? 'en';
    const url = `${baseUrl}/${locale}/newsletter/unsubscribe?token=${token}`;
    await this.mail.send({
      to: sub.email,
      subject: 'Unsubscribe confirmation',
      html: `<p>Click the link below to confirm you want to unsubscribe:</p><p><a href="${url}">Unsubscribe</a></p>`,
      text: `Unsubscribe: ${url}`,
      requestId: this.cls.getId(),
    });
  }

  private confirmUrl(locale: string | null, token: string): string {
    const baseUrl =
      this.config.get<AppConfig['PUBLIC_WEB_URL']>('PUBLIC_WEB_URL') ??
      'http://localhost:3000';
    return `${baseUrl}/${locale ?? 'en'}/newsletter/confirm?token=${token}`;
  }
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0),
    ),
  );
}
