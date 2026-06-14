import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { OrderItem, Payment } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getOrder, getPaymentsByOrder } from '@/lib/admin/api';
import { formatDate, formatPrice } from '@/lib/admin/format';

import { StatusButtons } from './status-buttons';

// Backend's OrderItemResponseDto includes `name` (the product's name at purchase
// time) — the @repo/types OrderItem doesn't expose it, so locally widen.
type EnrichedItem = OrderItem & { name?: string };

interface OrderDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps): Promise<React.ReactElement> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.orders');
  const tCommon = await getTranslations('admin.common');

  let order;
  try {
    order = await getOrder(id);
  } catch {
    notFound();
  }

  // Payments are optional — a freshly-created order may have none. Don't
  // surface a 500 if /payments/order/:id fails.
  let payments: Payment[] = [];
  try {
    payments = await getPaymentsByOrder(id);
  } catch {
    payments = [];
  }

  const items = (order.items ?? []) as EnrichedItem[];

  return (
    <div className="p-8 flex flex-col gap-6 max-w-6xl" data-testid="admin-orders-detail">
      <AdminBreadcrumbs
        segments={[
          { key: 'orders', href: '/admin/orders' },
          { key: 'detail', label: id.slice(0, 12) },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono" data-testid="admin-orders-detail-id">
            {id.slice(0, 12)}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
        </div>
        <StatusBadge status={order.status} label={t(`status.${order.status}`)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" data-testid="admin-orders-items-card">
          <CardHeader>
            <CardTitle>{t('items')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`admin-orders-item-${item.id}`}>
                    <TableCell>{item.name ?? item.productId.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatPrice(item.priceAtPurchase, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between mt-4 text-base font-bold">
              <span>{t('total')}</span>
              <span data-testid="admin-orders-detail-total">
                {formatPrice(order.total, locale)}
              </span>
            </div>
            {order.discountAmount !== null && order.discountAmount > 0 ? (
              <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                <span>{t('discount')}</span>
                <span data-testid="admin-orders-detail-discount">
                  −{formatPrice(order.discountAmount, locale)}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card data-testid="admin-orders-customer-card">
            <CardHeader>
              <CardTitle>{t('customer')}</CardTitle>
            </CardHeader>
            <CardContent>
              {order.customerId ? (
                <p className="font-mono text-xs" data-testid="admin-orders-customer-id">
                  {order.customerId}
                </p>
              ) : (
                <p className="text-muted-foreground italic">{t('guest')}</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="admin-orders-payments-card">
            <CardHeader>
              <CardTitle>{t('payments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tCommon('empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-1 text-xs"
                      data-testid={`admin-orders-payment-${p.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{p.provider}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <span className="font-mono text-muted-foreground truncate">
                        {p.providerPaymentId}
                      </span>
                      <span>
                        {formatPrice(p.amount, locale)} {p.currency.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card data-testid="admin-orders-transitions-card">
        <CardHeader>
          <CardTitle>{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusButtons orderId={id} currentStatus={order.status} />
        </CardContent>
      </Card>
    </div>
  );
}
