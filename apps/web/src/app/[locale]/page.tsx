import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8 flex flex-col gap-6">
      <h1 className="text-4xl font-bold" data-testid="home-heading">
        {brand.name}
      </h1>
      <p className="text-muted-foreground">Welcome — this is the {locale} storefront.</p>
      <Link href={`/${locale}/products`}>
        <Button data-testid="browse-products-button">Browse products</Button>
      </Link>
    </main>
  );
}
