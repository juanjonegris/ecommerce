import { setRequestLocale } from 'next-intl/server';

import { LoginForm } from './login-form';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({
  params,
  searchParams,
}: LoginPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  return (
    <main className="container mx-auto p-8 max-w-md flex flex-col gap-6" data-testid="login-page">
      <LoginForm locale={locale} next={next ?? `/${locale}/admin`} />
    </main>
  );
}
