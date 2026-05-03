import { setRequestLocale } from 'next-intl/server';

import { brand } from '@/config/brand';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8 max-w-3xl">
      <h1 className="text-3xl font-bold">About {brand.name}</h1>
      <p className="text-muted-foreground mt-4">Tell the story of the brand here.</p>
    </main>
  );
}
