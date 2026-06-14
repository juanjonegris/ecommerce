import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Conversation, Order } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { EmptyState } from '@/components/admin/empty-state';
import { KpiTile } from '@/components/admin/kpi-tile';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import {
  getAdminProducts,
  listConversationsForAdmin,
  listOrders,
  listSubscribers,
} from '@/lib/admin/api';
import { formatDate, formatPrice, formatRelative } from '@/lib/admin/format';

const REVENUE_STATUSES = new Set(['CONFIRMED', 'SHIPPED', 'DELIVERED']);
const LOW_STOCK_THRESHOLD = 10;
const RECENT_ROWS = 5;

interface AdminDashboardPageProps {
  params: Promise<{ locale: string }>;
}

interface DashboardData {
  ordersToday: number;
  revenue30d: number;
  lowStock: number;
  openChats: number;
  newsletterPending: number;
  recentOrders: Order[];
  recentChats: Conversation[];
}

async function loadDashboard(): Promise<DashboardData> {
  // Promise.allSettled so a single failing endpoint degrades that tile only
  // instead of blanking the whole dashboard.
  const results = await Promise.allSettled([
    listOrders({ limit: 50 }),
    getAdminProducts({ limit: 50 }),
    listConversationsForAdmin({ status: 'OPEN', limit: 1 }),
    listSubscribers({ status: 'PENDING', limit: 1 }),
    listConversationsForAdmin({ limit: RECENT_ROWS }),
  ]);

  const ordersResult = results[0];
  const productsResult = results[1];
  const openChatsResult = results[2];
  const pendingSubsResult = results[3];
  const recentChatsResult = results[4];

  const orders = ordersResult.status === 'fulfilled' ? ordersResult.value.data : [];
  const products = productsResult.status === 'fulfilled' ? productsResult.value.data : [];

  const startOfDayMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const ordersToday = orders.filter((o) => new Date(o.createdAt).getTime() >= startOfDayMs).length;

  const revenue30d = orders
    .filter(
      (o) => REVENUE_STATUSES.has(o.status) && new Date(o.createdAt).getTime() >= thirtyDaysAgoMs,
    )
    .reduce((sum, o) => sum + o.total, 0);

  const lowStock = products.filter((p) => p.stock < LOW_STOCK_THRESHOLD).length;

  return {
    ordersToday,
    revenue30d,
    lowStock,
    openChats: openChatsResult.status === 'fulfilled' ? openChatsResult.value.total : 0,
    newsletterPending: pendingSubsResult.status === 'fulfilled' ? pendingSubsResult.value.total : 0,
    recentOrders: orders.slice(0, RECENT_ROWS),
    recentChats: recentChatsResult.status === 'fulfilled' ? recentChatsResult.value.data : [],
  };
}

function conversationLabel(c: Conversation): string {
  if (c.subject) return c.subject;
  if (c.customerId) return `Customer ${c.customerId.slice(0, 8)}`;
  if (c.guestSession) return `Guest ${c.guestSession.slice(0, 8)}`;
  return c.id.slice(0, 8);
}

export default async function AdminDashboardPage({
  params,
}: AdminDashboardPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.dashboard');
  const tNav = await getTranslations('admin.nav');
  const tOrders = await getTranslations('admin.orders');
  const data = await loadDashboard();

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-dashboard">
      <AdminBreadcrumbs segments={[{ key: 'dashboard' }]} />
      <h1 className="text-3xl font-bold" data-testid="admin-dashboard-title">
        {t('title')}
      </h1>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        data-testid="admin-kpi-grid"
      >
        <KpiTile label={t('ordersToday')} value={data.ordersToday} testid="admin-kpi-ordersToday" />
        <KpiTile
          label={t('revenue30d')}
          value={formatPrice(data.revenue30d, locale)}
          testid="admin-kpi-revenue30d"
        />
        <KpiTile
          label={t('lowStock')}
          value={data.lowStock}
          sublabel={`< ${String(LOW_STOCK_THRESHOLD)} units`}
          testid="admin-kpi-lowStock"
        />
        <KpiTile label={t('openChats')} value={data.openChats} testid="admin-kpi-openChats" />
        <KpiTile
          label={t('newsletterPending')}
          value={data.newsletterPending}
          testid="admin-kpi-newsletterPending"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="admin-recent-orders">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('recentOrders')}</CardTitle>
            <Link
              href="/admin/orders"
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="admin-recent-orders-link"
            >
              {tNav('orders')} →
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <EmptyState title={t('noRecent')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recentOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 text-sm"
                    data-testid={`admin-recent-order-${o.id}`}
                  >
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-xs hover:underline truncate"
                    >
                      {o.id.slice(0, 12)}
                    </Link>
                    <StatusBadge status={o.status} label={tOrders(`status.${o.status}`)} />
                    <span className="font-medium">{formatPrice(o.total, locale)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(o.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="admin-recent-chats">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('recentChats')}</CardTitle>
            <Link
              href="/admin/chat"
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="admin-recent-chats-link"
            >
              {tNav('chat')} →
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentChats.length === 0 ? (
              <EmptyState title={t('noRecent')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recentChats.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-sm"
                    data-testid={`admin-recent-chat-${c.id}`}
                  >
                    <span className="truncate flex-1">{conversationLabel(c)}</span>
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(c.lastMessageAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
