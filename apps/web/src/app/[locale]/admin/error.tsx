'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminAuthError } from '@/lib/admin/auth-error';

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const t = useTranslations('admin.common');

  useEffect(() => {
    if (error.name === AdminAuthError.NAME) {
      router.push(`/${params.locale}/login`);
    }
  }, [error, router, params.locale]);

  return (
    <div className="p-8" data-testid="admin-error">
      <Card>
        <CardHeader>
          <CardTitle>{t('error')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={reset} data-testid="admin-error-retry">
            {t('back')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
