import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim())),
  THROTTLE_TTL: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(10),
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
