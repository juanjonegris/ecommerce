import { Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Product } from '@repo/types';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/admin/empty-state';
import { StatusBadge } from '@/components/admin/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getAdminProducts, listCategories, type AdminProductsQuery } from '@/lib/admin/api';
import { formatPrice } from '@/lib/admin/format';

import { ProductRowActions } from './row-actions';

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    categoryId?: string;
    sortBy?: 'price' | 'createdAt';
    order?: 'asc' | 'desc';
  }>;
}

function buildQuery(sp: Awaited<ProductsPageProps['searchParams']>): AdminProductsQuery {
  const out: AdminProductsQuery = { limit: 20 };
  if (sp.page) out.page = Number(sp.page);
  if (sp.categoryId) out.categoryId = sp.categoryId;
  if (sp.sortBy) out.sortBy = sp.sortBy;
  if (sp.order) out.order = sp.order;
  return out;
}

export default async function ProductsListPage({
  params,
  searchParams,
}: ProductsPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.products');
  const tCommon = await getTranslations('admin.common');

  const [productsResult, categoriesResult] = await Promise.allSettled([
    getAdminProducts(buildQuery(sp)),
    listCategories(),
  ]);
  const products = productsResult.status === 'fulfilled' ? productsResult.value.data : [];
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (p) => (
        <Link
          href={`/admin/products/${p.slug}`}
          className="font-medium hover:underline"
          data-testid={`admin-products-row-${p.slug}-link`}
        >
          {p.name}
        </Link>
      ),
    },
    {
      key: 'price',
      header: t('price'),
      cell: (p) => formatPrice(p.price, locale),
    },
    {
      key: 'stock',
      header: t('stock'),
      cell: (p) => (
        <span
          className={p.stock < 10 ? 'text-destructive font-medium' : ''}
          data-testid={`admin-products-stock-${p.slug}`}
        >
          {p.stock}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      cell: (p) => categoriesById.get(p.categoryId) ?? p.categoryId.slice(0, 8),
    },
    {
      key: 'status',
      header: t('active'),
      cell: (p) => (
        <StatusBadge
          status={p.isActive ? 'READY' : 'CANCELLED'}
          label={p.isActive ? t('active') : tCommon('delete')}
        />
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      cell: (p) => <ProductRowActions productId={p.id} productSlug={p.slug} />,
      className: 'text-right w-24',
    },
  ];

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-products-page">
      <AdminBreadcrumbs segments={[{ key: 'products' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <Link
          href="/admin/products/new"
          className={buttonVariants()}
          data-testid="admin-products-new-button"
        >
          <Plus className="size-4 mr-2" aria-hidden />
          {t('new')}
        </Link>
      </div>
      <DataTable<Product>
        columns={columns}
        rows={products}
        rowKey={(p) => p.slug}
        emptyState={<EmptyState title={tCommon('empty')} />}
        testid="admin-products-table"
      />
    </div>
  );
}
