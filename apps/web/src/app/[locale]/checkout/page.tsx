import { setRequestLocale } from 'next-intl/server';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold">Checkout</h1>
      <p className="text-muted-foreground mt-4">Coming soon — Stripe integration.</p>
    </main>
  );
}
