import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import type { Product } from '@repo/types';

import { AddToCartButton } from '@/components/add-to-cart-button';
import { getProduct } from '@/lib/api';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  let product: Product;
  try {
    product = await getProduct(slug, locale);
  } catch {
    notFound();
  }

  const price = product.price.toFixed(2);

  return (
    <main className="container mx-auto p-8 flex flex-col gap-6 max-w-2xl">
      <h1 className="text-3xl font-bold" data-testid="product-name">
        {product.name}
      </h1>
      {product.description ? (
        <p className="text-muted-foreground" data-testid="product-description">
          {product.description}
        </p>
      ) : null}
      <p className="text-2xl font-semibold" data-testid="product-price">
        ${price}
      </p>
      <AddToCartButton
        productId={product.id}
        slug={product.slug}
        name={product.name}
        price={product.price}
      />
    </main>
  );
}
