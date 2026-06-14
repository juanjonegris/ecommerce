import { cookies } from 'next/headers';
import { cache } from 'react';

import type { User } from '@repo/types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'session';

/**
 * Read the bearer token from the session cookie. Server-only.
 * Returns null if the cookie is absent — caller decides what to do.
 */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Resolve the current user via /auth/me. Memoized per-request via React's
 * cache() so the layout + page can both call it without two roundtrips.
 *
 * Returns null on 401/404 (logged-out OR token expired). Throws on other
 * non-2xx so the route's error boundary can render a recoverable state.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`/auth/me failed: ${String(res.status)}`);
  }
  return (await res.json()) as User;
});

export { SESSION_COOKIE };
