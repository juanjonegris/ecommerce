import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { listCategories } from '@/lib/admin/api';

import { ProductForm } from '../product-form';

interface NewProductPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewProductPage({
  params,
}: NewProductPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.products');
  const categories = await listCategories();

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-products-new-page">
      <AdminBreadcrumbs
        segments={[
          { key: 'products', href: '/admin/products' },
          { key: 'new', label: t('new') },
        ]}
      />
      <h1 className="text-3xl font-bold">{t('new')}</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
