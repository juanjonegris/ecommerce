import type {
  NewsletterSource,
  NewsletterStatus,
  NewsletterSubscriber,
  NewsletterSyncState,
} from '@repo/types';

/**
 * In-process shape of a newsletter subscriber row. Implements the public
 * `NewsletterSubscriber` interface from `@repo/types` — which intentionally
 * EXCLUDES `confirmationToken`. The DB row carries the token; the entity does
 * NOT. The service reads the token from the raw Prisma row inside its repo
 * methods and never lets it escape this boundary.
 */
export class NewsletterSubscriberEntity implements NewsletterSubscriber {
  id!: string;
  email!: string;
  status!: NewsletterStatus;
  source!: NewsletterSource;
  locale!: string | null;
  tags!: string[];
  providerSubscriberId!: string | null;
  provider!: string | null;
  syncState!: NewsletterSyncState;
  lastSyncAt!: Date | null;
  lastSyncError!: string | null;
  confirmedAt!: Date | null;
  unsubscribedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
