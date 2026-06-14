import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { listCategories } from '@/lib/admin/api';

import { CategoryTree } from './category-tree';

interface CategoriesPageProps {
  params: Promise<{ locale: string }>;
}

export default async function CategoriesPage({
  params,
}: CategoriesPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.categories');
  const categories = await listCategories();

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-categories-page">
      <AdminBreadcrumbs segments={[{ key: 'categories' }]} />
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <CategoryTree categories={categories} />
    </div>
  );
}
