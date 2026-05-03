import { setRequestLocale } from 'next-intl/server';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold">Admin dashboard</h1>
      <p className="text-muted-foreground mt-4">
        Protected area — access control TBD via middleware.
      </p>
    </main>
  );
}
