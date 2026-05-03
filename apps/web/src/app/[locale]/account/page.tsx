import { setRequestLocale } from 'next-intl/server';

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold">My account</h1>
      <p className="text-muted-foreground mt-4">Profile, addresses, and orders.</p>
    </main>
  );
}
