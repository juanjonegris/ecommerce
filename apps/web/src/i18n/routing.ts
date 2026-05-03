import { defineRouting } from 'next-intl/routing';

import { brand } from '@/config/brand';

export const routing = defineRouting({
  locales: brand.locales,
  defaultLocale: brand.defaultLocale,
});
