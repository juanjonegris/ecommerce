import { ApiProperty } from '@nestjs/swagger';

import type {
  NewsletterSource,
  NewsletterStatus,
  NewsletterSyncState,
} from '@repo/types';

import type { NewsletterSubscriberEntity } from '../entities/newsletter-subscriber.entity';

/**
 * Outbound subscriber DTO. `from(entity)` is the ONLY entry point —
 * `confirmationToken` is never on the entity by construction, so it can never
 * surface here (defense-in-depth alongside the @repo/types interface).
 */
export class NewsletterSubscriberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'UNSUBSCRIBED'] })
  status!: NewsletterStatus;
  @ApiProperty({ enum: ['FOOTER', 'CHECKOUT', 'POPUP', 'ADMIN', 'UNKNOWN'] })
  source!: NewsletterSource;
  @ApiProperty({ nullable: true }) locale!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ nullable: true }) providerSubscriberId!: string | null;
  @ApiProperty({ nullable: true, enum: ['mailchimp', 'klaviyo', 'stub'] })
  provider!: string | null;
  @ApiProperty({
    enum: ['SYNCED', 'PENDING_SYNC', 'FAILED', 'NOT_APPLICABLE'],
  })
  syncState!: NewsletterSyncState;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastSyncAt!: Date | null;
  @ApiProperty({ nullable: true }) lastSyncError!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  confirmedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  unsubscribedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static from(
    entity: NewsletterSubscriberEntity,
  ): NewsletterSubscriberResponseDto {
    const dto = new NewsletterSubscriberResponseDto();
    dto.id = entity.id;
    dto.email = entity.email;
    dto.status = entity.status;
    dto.source = entity.source;
    dto.locale = entity.locale;
    dto.tags = entity.tags;
    dto.providerSubscriberId = entity.providerSubscriberId;
    dto.provider = entity.provider;
    dto.syncState = entity.syncState;
    dto.lastSyncAt = entity.lastSyncAt;
    dto.lastSyncError = entity.lastSyncError;
    dto.confirmedAt = entity.confirmedAt;
    dto.unsubscribedAt = entity.unsubscribedAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
