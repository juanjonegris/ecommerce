import type { PaginatedResponse, Product } from '@repo/types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Cache tag on every storefront catalog read (list + detail). */
export const PRODUCTS_TAG = 'products';

/** Cache tag on a single product's detail read. */
export function productTag(slug: string): string {
  return `product:${slug}`;
}

interface FetchOpts {
  locale?: string;
  revalidate?: number;
  tags?: string[];
}

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.locale) headers['Accept-Language'] = opts.locale;

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    next: {
      revalidate: opts.revalidate ?? 60,
      tags: opts.tags ?? [],
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${String(res.status)} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getProducts(page = 1, locale?: string): Promise<PaginatedResponse<Product>> {
  const opts: FetchOpts = { revalidate: 60, tags: [PRODUCTS_TAG] };
  if (locale) opts.locale = locale;
  return apiFetch<PaginatedResponse<Product>>(`/products?page=${String(page)}`, opts);
}

export function getProduct(slug: string, locale?: string): Promise<Product> {
  const opts: FetchOpts = {
    revalidate: 60,
    tags: [PRODUCTS_TAG, productTag(slug)],
  };
  if (locale) opts.locale = locale;
  return apiFetch<Product>(`/products/${encodeURIComponent(slug)}`, opts);
}
