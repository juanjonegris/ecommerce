import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDiscount } from '@/lib/admin/api';

import { DiscountForm } from '../discount-form';

interface EditDiscountPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditDiscountPage({
  params,
}: EditDiscountPageProps): Promise<React.ReactElement> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.discounts');

  let discount;
  try {
    discount = await getDiscount(id);
  } catch {
    notFound();
  }

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl" data-testid="admin-discounts-edit-page">
      <AdminBreadcrumbs
        segments={[
          { key: 'discounts', href: '/admin/discounts' },
          { key: 'edit', label: discount.code },
        ]}
      />
      <h1 className="text-3xl font-bold font-mono" data-testid="admin-discounts-edit-title">
        {discount.code}
      </h1>

      <Card>
        <CardContent className="pt-6">
          <DiscountForm discount={discount} />
        </CardContent>
      </Card>

      <Card data-testid="admin-discounts-redemptions-card">
        <CardHeader>
          <CardTitle>{t('redemptionsCount', { count: 0 })}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('redemptionsNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
