import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import type { Product } from '@repo/types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { brand } from '@/config/brand';
import { getProducts } from '@/lib/api';

function formatPrice(price: Product['price']): string {
  return price.toFixed(2);
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  let products: Product[] = [];
  let fetchError: string | null = null;
  try {
    const result = await getProducts(1, locale);
    products = result.data;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <main className="container mx-auto p-8 flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{brand.name} — Products</h1>
      {fetchError ? (
        <p className="text-destructive" data-testid="products-error">
          Could not load products: {fetchError}
        </p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground" data-testid="products-empty">
          No products available. Make sure the API is running and seeded.
        </p>
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="product-grid"
        >
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/${locale}/products/${p.slug}`} data-testid={`product-card-${p.slug}`}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle data-testid="product-card-name">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{p.description ?? ''}</p>
                    <p className="font-bold mt-2" data-testid="product-card-price">
                      ${formatPrice(p.price)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
