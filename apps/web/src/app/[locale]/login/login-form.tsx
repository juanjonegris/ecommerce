'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { loginAction, type LoginState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  locale: string;
  next: string;
}

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  const t = useTranslations('admin.login');
  return (
    <Button type="submit" className="w-full" disabled={pending} data-testid="login-submit">
      {pending ? t('loading') : t('submit')}
    </Button>
  );
}

export function LoginForm({ locale, next }: LoginFormProps): React.ReactElement {
  const t = useTranslations('admin.login');
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="login-title">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              data-testid="login-email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              data-testid="login-password"
            />
          </div>
          {state.error ? (
            <p className="text-destructive text-sm" data-testid="login-error" role="alert">
              {t('invalid')}
            </p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
