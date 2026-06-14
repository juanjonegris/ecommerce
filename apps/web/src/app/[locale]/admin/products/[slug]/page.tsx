import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminProduct, listCategories, listProductImages } from '@/lib/admin/api';

import { ProductForm } from '../product-form';

import { ImageManager } from './image-manager';

interface EditProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.products');

  let product;
  try {
    product = await getAdminProduct(slug);
  } catch {
    notFound();
  }

  const [categories, imagesPage] = await Promise.all([
    listCategories(),
    listProductImages(product.id),
  ]);

  return (
    <div className="p-8 flex flex-col gap-6 max-w-5xl" data-testid="admin-products-edit-page">
      <AdminBreadcrumbs
        segments={[
          { key: 'products', href: '/admin/products' },
          { key: 'edit', label: product.name },
        ]}
      />
      <h1 className="text-3xl font-bold" data-testid="admin-products-edit-title">
        {product.name}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('name')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm product={product} categories={categories} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('images')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageManager productId={product.id} images={imagesPage.data} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
