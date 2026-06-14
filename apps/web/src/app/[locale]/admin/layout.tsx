import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import { Toaster } from '@/components/ui/sonner';
import { getCurrentUser } from '@/lib/auth';

// Per-user data, no shared cache, no static optimization.
export const dynamic = 'force-dynamic';

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/admin`);
  }
  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    // Redirect CUSTOMER role to the storefront homepage rather than 403 —
    // less hostile UX for someone who landed here by accident.
    redirect(`/${locale}`);
  }

  return (
    <>
      <AdminShell user={user} locale={locale}>
        {children}
      </AdminShell>
      <Toaster />
    </>
  );
}
