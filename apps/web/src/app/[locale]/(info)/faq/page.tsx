import { setRequestLocale } from 'next-intl/server';

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8 max-w-3xl">
      <h1 className="text-3xl font-bold">Frequently asked questions</h1>
      <p className="text-muted-foreground mt-4">Common questions and answers.</p>
    </main>
  );
}
