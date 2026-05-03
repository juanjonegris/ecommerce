// White-label fork point #1 (PRD §5.3): change values here when forking for a
// new client. Brand-specific runtime configuration only — visual tokens live
// in src/app/globals.css, logo lives in /public/logo.svg.
export const brand = {
  name: 'Demo Store',
  supportEmail: 'support@demo.store',
  defaultLocale: 'es',
  locales: ['es', 'en'],
} as const;

export type Locale = (typeof brand.locales)[number];
