import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim())),
  THROTTLE_TTL: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(10),
  // Empty = dev stub mode: MailService logs the payload instead of sending.
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('no-reply@localhost'),
  // Empty = dev stub mode: PaymentsModule binds StubPaymentProvider instead of Stripe.
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_CURRENCY: z.string().length(3).default('usd'),
  // Newsletter — NEWSLETTER_PROVIDER selects the adapter. Empty key forces stub.
  NEWSLETTER_PROVIDER: z.enum(['mailchimp', 'klaviyo', 'stub']).default('stub'),
  NEWSLETTER_DOUBLE_OPT_IN: z.coerce.boolean().default(true),
  MAILCHIMP_API_KEY: z.string().default(''),
  MAILCHIMP_AUDIENCE_ID: z.string().default(''),
  MAILCHIMP_WEBHOOK_SECRET: z.string().default(''),
  KLAVIYO_API_KEY: z.string().default(''),
  KLAVIYO_LIST_ID: z.string().default(''),
  KLAVIYO_WEBHOOK_SECRET: z.string().default(''),
  // Storefront URL — used to build confirmation links in newsletter emails.
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  // Object storage (S3 / MinIO). Empty access key → StubStorageProvider.
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_PUBLIC_URL: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  UPLOAD_MAX_BYTES: z.coerce.number().default(5_242_880),
  UPLOAD_ALLOWED_MIMES: z
    .string()
    .default('image/jpeg,image/png,image/webp,image/avif')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  // Search. SEARCH_PROVIDER picks the adapter (postgres-fts is the MVP;
  // meilisearch later). SEARCH_FTS_LANGUAGE is free-form because Postgres
  // FTS configs are extensible (a fork may install custom dictionaries).
  SEARCH_PROVIDER: z.enum(['postgres-fts', 'stub']).default('postgres-fts'),
  SEARCH_FTS_LANGUAGE: z.string().default('simple'),
  SEARCH_MAX_QUERY_LENGTH: z.coerce
    .number()
    .int()
    .min(20)
    .max(2000)
    .default(200),
  SEARCH_HIGHLIGHT_ENABLED: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${issues}`);
  }
  return result.data;
}

export const configuration = (): AppConfig => ConfigSchema.parse(process.env);
