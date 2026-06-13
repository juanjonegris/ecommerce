import { z } from 'zod';

export const NewsletterStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'UNSUBSCRIBED']);
export type NewsletterStatus = z.infer<typeof NewsletterStatusSchema>;

export const NewsletterSourceSchema = z.enum(['FOOTER', 'CHECKOUT', 'POPUP', 'ADMIN', 'UNKNOWN']);
export type NewsletterSource = z.infer<typeof NewsletterSourceSchema>;

export const NewsletterSyncStateSchema = z.enum([
  'SYNCED',
  'PENDING_SYNC',
  'FAILED',
  'NOT_APPLICABLE',
]);
export type NewsletterSyncState = z.infer<typeof NewsletterSyncStateSchema>;

/**
 * Public newsletter subscriber shape. Intentionally EXCLUDES
 * `confirmationToken` — that field is local-only and must never leak in API
 * responses or shared types (D3, D7 of the plan).
 */
export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: NewsletterStatus;
  source: NewsletterSource;
  locale: string | null;
  tags: string[];
  providerSubscriberId: string | null;
  provider: string | null;
  syncState: NewsletterSyncState;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const NewsletterSubscriberSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: NewsletterStatusSchema,
  source: NewsletterSourceSchema,
  locale: z.string().nullable(),
  tags: z.array(z.string()),
  providerSubscriberId: z.string().nullable(),
  provider: z.string().nullable(),
  syncState: NewsletterSyncStateSchema,
  lastSyncAt: z.date().nullable(),
  lastSyncError: z.string().nullable(),
  confirmedAt: z.date().nullable(),
  unsubscribedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<NewsletterSubscriber>;
