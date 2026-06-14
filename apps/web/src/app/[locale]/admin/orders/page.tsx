import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Order, OrderStatus } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
import { Link } from '@/i18n/navigation';
import { listOrders, type AdminOrdersQuery } from '@/lib/admin/api';
import { formatDate, formatPrice } from '@/lib/admin/format';

const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

interface OrdersPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: OrderStatus }>;
}

function buildQuery(sp: Awaited<OrdersPageProps['searchParams']>): AdminOrdersQuery {
  const out: AdminOrdersQuery = { limit: 50 };
  if (sp.page) out.page = Number(sp.page);
  if (sp.status) out.status = sp.status;
  return out;
}

export default async function OrdersListPage({
  params,
  searchParams,
}: OrdersPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.orders');
  const tCommon = await getTranslations('admin.common');

  const result = await listOrders(buildQuery(sp));

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'id',
      header: t('id'),
      cell: (o) => (
        <Link
          href={`/admin/orders/${o.id}`}
          className="font-mono text-xs hover:underline"
          data-testid={`admin-orders-row-${o.id}-link`}
        >
          {o.id.slice(0, 12)}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: t('customer'),
      cell: (o) =>
        o.customerId ? (
          <span className="font-mono text-xs">{o.customerId.slice(0, 12)}</span>
        ) : (
          <span className="text-muted-foreground italic">{t('guest')}</span>
        ),
    },
    {
      key: 'total',
      header: t('total'),
      cell: (o) => formatPrice(o.total, locale),
    },
    {
      key: 'status',
      header: tCommon('view'),
      cell: (o) => <StatusBadge status={o.status} label={t(`status.${o.status}`)} />,
    },
    {
      key: 'createdAt',
      header: tCommon('view'),
      cell: (o) => (
        <span className="text-xs text-muted-foreground">{formatDate(o.createdAt, locale)}</span>
      ),
    },
  ];

  const activeStatus = sp.status;

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-orders-page">
      <AdminBreadcrumbs segments={[{ key: 'orders' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="admin-orders-filters">
        <Link
          href="/admin/orders"
          className={
            activeStatus === undefined
              ? 'text-sm font-medium underline'
              : 'text-sm text-muted-foreground hover:text-foreground'
          }
          data-testid="admin-orders-filter-all"
        >
          {tCommon('view')}
        </Link>
        {STATUS_OPTIONS.map((status) => (
          <Link
            key={status}
            href={{ pathname: '/admin/orders', query: { status } }}
            className={
              activeStatus === status
                ? 'text-sm font-medium underline'
                : 'text-sm text-muted-foreground hover:text-foreground'
            }
            data-testid={`admin-orders-filter-${status}`}
          >
            {t(`status.${status}`)}
          </Link>
        ))}
      </div>

      <DataTable<Order>
        columns={columns}
        rows={result.data}
        rowKey={(o) => o.id}
        emptyState={<EmptyState title={tCommon('empty')} />}
        testid="admin-orders-table"
      />
    </div>
  );
}
