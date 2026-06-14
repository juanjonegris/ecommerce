import { Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { DiscountCode } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { listDiscounts } from '@/lib/admin/api';
import { formatDate, formatPrice } from '@/lib/admin/format';

import { DiscountRowActions } from './row-actions';

interface DiscountsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DiscountsListPage({
  params,
}: DiscountsPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.discounts');
  const tCommon = await getTranslations('admin.common');

  const result = await listDiscounts({ limit: 50 });

  const columns: DataTableColumn<DiscountCode>[] = [
    {
      key: 'code',
      header: t('code'),
      cell: (d) => (
        <Link
          href={`/admin/discounts/${d.id}`}
          className="font-mono font-medium hover:underline"
          data-testid={`admin-discounts-row-${d.code}-link`}
        >
          {d.code}
        </Link>
      ),
    },
    {
      key: 'value',
      header: t('type'),
      cell: (d) =>
        d.percentOff !== null
          ? `${String(d.percentOff)}%`
          : d.amountOff !== null
            ? formatPrice(d.amountOff, locale)
            : '—',
    },
    {
      key: 'expiresAt',
      header: t('expiresAt'),
      cell: (d) =>
        d.expiresAt ? (
          formatDate(d.expiresAt, locale)
        ) : (
          <span className="text-muted-foreground">∞</span>
        ),
    },
    {
      key: 'status',
      header: t('active'),
      cell: (d) => (
        <StatusBadge
          status={d.isActive ? 'READY' : 'CANCELLED'}
          label={d.isActive ? t('active') : tCommon('delete')}
        />
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      cell: (d) => <DiscountRowActions discountId={d.id} discountCode={d.code} />,
      className: 'text-right w-24',
    },
  ];

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-discounts-page">
      <AdminBreadcrumbs segments={[{ key: 'discounts' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <Link
          href="/admin/discounts/new"
          className={buttonVariants()}
          data-testid="admin-discounts-new-button"
        >
          <Plus className="size-4 mr-2" aria-hidden />
          {t('new')}
        </Link>
      </div>
      <DataTable<DiscountCode>
        columns={columns}
        rows={result.data}
        rowKey={(d) => d.id}
        emptyState={<EmptyState title={tCommon('empty')} />}
        testid="admin-discounts-table"
      />
    </div>
  );
}
