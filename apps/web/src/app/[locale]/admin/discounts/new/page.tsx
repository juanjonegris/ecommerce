import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';

import { DiscountForm } from '../discount-form';

interface NewDiscountPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewDiscountPage({
  params,
}: NewDiscountPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.discounts');

  return (
    <div className="p-8 flex flex-col gap-6" data-testid="admin-discounts-new-page">
      <AdminBreadcrumbs
        segments={[
          { key: 'discounts', href: '/admin/discounts' },
          { key: 'new', label: t('new') },
        ]}
      />
      <h1 className="text-3xl font-bold">{t('new')}</h1>
      <DiscountForm />
    </div>
  );
}
