import { Check, X } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { brand } from '@/config/brand';

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

interface RuntimeSnapshot {
  providers: {
    payment: 'stripe' | 'stub';
    newsletter: 'mailchimp' | 'klaviyo' | 'stub';
    storage: 's3' | 'stub';
    search: 'postgres-fts' | 'stub';
  };
  configured: {
    stripe: boolean;
    resend: boolean;
    mailchimp: boolean;
    klaviyo: boolean;
    s3: boolean;
  };
  searchLanguage: string;
}

/**
 * Server-side env snapshot. Reads process.env at request time (the admin
 * layout opts the subtree into force-dynamic so this isn't cached) and
 * returns a SANITIZED structure — booleans + provider-name strings only,
 * NEVER the secret values themselves.
 */
function readRuntimeSnapshot(): RuntimeSnapshot {
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  const resendKey = process.env.RESEND_API_KEY ?? '';
  const mailchimpKey = process.env.MAILCHIMP_API_KEY ?? '';
  const klaviyoKey = process.env.KLAVIYO_API_KEY ?? '';
  const s3AccessKey = process.env.S3_ACCESS_KEY ?? '';
  const s3SecretKey = process.env.S3_SECRET_KEY ?? '';
  const s3Bucket = process.env.S3_BUCKET ?? '';

  const newsletterProvider = process.env.NEWSLETTER_PROVIDER ?? 'stub';
  const searchProvider = process.env.SEARCH_PROVIDER ?? 'postgres-fts';
  const searchLanguage = process.env.SEARCH_FTS_LANGUAGE ?? 'simple';

  const s3Configured = s3AccessKey.length > 0 && s3SecretKey.length > 0 && s3Bucket.length > 0;

  const newsletterName: 'mailchimp' | 'klaviyo' | 'stub' =
    newsletterProvider === 'mailchimp' && mailchimpKey.length > 0
      ? 'mailchimp'
      : newsletterProvider === 'klaviyo' && klaviyoKey.length > 0
        ? 'klaviyo'
        : 'stub';

  return {
    providers: {
      payment: stripeKey.length > 0 ? 'stripe' : 'stub',
      newsletter: newsletterName,
      storage: s3Configured ? 's3' : 'stub',
      search: searchProvider === 'stub' ? 'stub' : 'postgres-fts',
    },
    configured: {
      stripe: stripeKey.length > 0,
      resend: resendKey.length > 0,
      mailchimp: mailchimpKey.length > 0,
      klaviyo: klaviyoKey.length > 0,
      s3: s3Configured,
    },
    searchLanguage,
  };
}

function ConfiguredFlag({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 text-sm"
      data-testid={`admin-settings-flag-${label.toLowerCase()}`}
    >
      {ok ? (
        <Check className="size-4 text-green-600" aria-hidden />
      ) : (
        <X className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default async function SettingsPage({
  params,
}: SettingsPageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings');
  const snapshot = readRuntimeSnapshot();

  return (
    <div className="p-8 flex flex-col gap-6 max-w-5xl" data-testid="admin-settings-page">
      <AdminBreadcrumbs segments={[{ key: 'settings' }]} />
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('readOnly')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="admin-settings-brand-card">
          <CardHeader>
            <CardTitle>{t('brand')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('brandName')}</span>
              <span className="font-medium" data-testid="admin-settings-brand-name">
                {brand.name}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('supportEmail')}</span>
              <span className="font-mono text-xs">{brand.supportEmail}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('locales')}</span>
              <div className="flex gap-1 flex-wrap" data-testid="admin-settings-locales">
                {brand.locales.map((l) => (
                  <Badge key={l} variant={l === brand.defaultLocale ? 'default' : 'outline'}>
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="admin-settings-providers-card">
          <CardHeader>
            <CardTitle>{t('providers')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('providerPayment')}</span>
              <Badge
                variant={snapshot.providers.payment === 'stripe' ? 'default' : 'outline'}
                data-testid="admin-settings-provider-payment"
              >
                {snapshot.providers.payment}
              </Badge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('providerNewsletter')}</span>
              <Badge
                variant={snapshot.providers.newsletter === 'stub' ? 'outline' : 'default'}
                data-testid="admin-settings-provider-newsletter"
              >
                {snapshot.providers.newsletter}
              </Badge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('providerStorage')}</span>
              <Badge
                variant={snapshot.providers.storage === 's3' ? 'default' : 'outline'}
                data-testid="admin-settings-provider-storage"
              >
                {snapshot.providers.storage}
              </Badge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t('providerSearch')}</span>
              <Badge
                variant={snapshot.providers.search === 'postgres-fts' ? 'default' : 'outline'}
                data-testid="admin-settings-provider-search"
              >
                {snapshot.providers.search}{' '}
                <span className="ml-1 text-xs opacity-60">({snapshot.searchLanguage})</span>
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="admin-settings-configured-card">
          <CardHeader>
            <CardTitle>
              {t('configured')} / {t('notConfigured')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <ConfiguredFlag ok={snapshot.configured.stripe} label="Stripe" />
            <ConfiguredFlag ok={snapshot.configured.resend} label="Resend" />
            <ConfiguredFlag ok={snapshot.configured.mailchimp} label="Mailchimp" />
            <ConfiguredFlag ok={snapshot.configured.klaviyo} label="Klaviyo" />
            <ConfiguredFlag ok={snapshot.configured.s3} label="S3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
