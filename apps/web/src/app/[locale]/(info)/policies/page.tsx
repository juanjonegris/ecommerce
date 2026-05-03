import { setRequestLocale } from 'next-intl/server';

export default async function PoliciesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8 max-w-3xl">
      <h1 className="text-3xl font-bold">Policies</h1>
      <p className="text-muted-foreground mt-4">Privacy, terms, shipping &amp; returns.</p>
    </main>
  );
}
