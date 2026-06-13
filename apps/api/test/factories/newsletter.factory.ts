import type { NewsletterSubscriber } from '@repo/types';

let counter = 0;

export function createMockSubscriber(
  overrides: Partial<NewsletterSubscriber> = {},
): NewsletterSubscriber {
  const n = ++counter;
  return {
    id: `sub-${String(n)}`,
    email: `user${String(n)}@example.com`,
    status: 'PENDING',
    source: 'FOOTER',
    locale: 'en',
    tags: [],
    providerSubscriberId: null,
    provider: null,
    syncState: 'PENDING_SYNC',
    lastSyncAt: null,
    lastSyncError: null,
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
