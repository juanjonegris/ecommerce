import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { NewsletterStatus, NewsletterSubscriber, NewsletterSyncState } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
import { Link } from '@/i18n/navigation';
import { listSubscribers, type AdminNewsletterQuery } from '@/lib/admin/api';
import { formatRelative } from '@/lib/admin/format';

import { NewsletterRowActions } from './row-actions';

const STATUS_OPTIONS: NewsletterStatus[] = ['PENDING', 'CONFIRMED', 'UNSUBSCRIBED'];

interface NewsletterPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    status?: NewsletterStatus;
    syncState?: NewsletterSyncState;
    provider?: string;
    search?: string;
  }>;
}

function buildQuery(sp: Awaited<NewsletterPageProps['searchParams']>): AdminNewsletterQuery {
  const out: AdminNewsletterQuery = { limit: 50 };
  if (sp.page) out.page = Number(sp.page);
  if (sp.status) out.status = sp.status;
  if (sp.syncState) out.syncState = sp.syncState;
  if (sp.provider) out.provider = sp.provider;
  if (sp.search) out.search = sp.search;
  return out;
}

export default async function NewsletterListPage({
  params,
  searchParams,
}: NewsletterPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.newsletter');
  const tCommon = await getTranslations('admin.common');

  const result = await listSubscribers(buildQuery(sp));

  const activeStatus = sp.status;

  const columns: DataTableColumn<NewsletterSubscriber>[] = [
    {
      key: 'email',
      header: t('email'),
      cell: (s) => (
        <span
          className="font-medium"
          data-testid={`admin-newsletter-email-${s.email.replace(/[^a-zA-Z0-9]/g, '-')}`}
        >
          {s.email}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'source',
      header: t('source'),
      cell: (s) => <span className="text-xs text-muted-foreground">{s.source}</span>,
    },
    {
      key: 'provider',
      header: t('provider'),
      cell: (s) =>
        s.provider ? (
          <span className="text-xs font-mono">{s.provider}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'syncState',
      header: t('syncState'),
      cell: (s) => <StatusBadge status={s.syncState} />,
    },
    {
      key: 'lastSync',
      header: t('lastSync'),
      cell: (s) =>
        s.lastSyncAt ? (
          <span className="text-xs text-muted-foreground">
            {formatRelative(s.lastSyncAt, locale)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      cell: (s) => <NewsletterRowActions subscriberId={s.id} email={s.email} />,
      className: 'text-right w-24',
    },
  ];

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-newsletter-page">
      <AdminBreadcrumbs segments={[{ key: 'newsletter' }]} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>

      <div className="flex flex-wrap items-center gap-2" data-testid="admin-newsletter-filters">
        <Link
          href="/admin/newsletter"
          className={
            activeStatus === undefined
              ? 'text-sm font-medium underline'
              : 'text-sm text-muted-foreground hover:text-foreground'
          }
          data-testid="admin-newsletter-filter-all"
        >
          {tCommon('view')}
        </Link>
        {STATUS_OPTIONS.map((status) => (
          <Link
            key={status}
            href={{ pathname: '/admin/newsletter', query: { status } }}
            className={
              activeStatus === status
                ? 'text-sm font-medium underline'
                : 'text-sm text-muted-foreground hover:text-foreground'
            }
            data-testid={`admin-newsletter-filter-${status}`}
          >
            {status}
          </Link>
        ))}
      </div>

      <DataTable<NewsletterSubscriber>
        columns={columns}
        rows={result.data}
        rowKey={(s) => s.id}
        emptyState={<EmptyState title={tCommon('empty')} />}
        testid="admin-newsletter-table"
      />
    </div>
  );
}
