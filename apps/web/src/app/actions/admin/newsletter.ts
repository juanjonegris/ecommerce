'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface NewsletterActionResult {
  ok: boolean;
  error?: string;
  errorCode?: 'CONFLICT' | 'UNKNOWN';
}

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

function classify(status: number): 'CONFLICT' | 'UNKNOWN' {
  return status === 409 ? 'CONFLICT' : 'UNKNOWN';
}

/**
 * Force a provider-side resync for a subscriber. Backend returns 409 when
 * the stored `provider` differs from the currently bound provider — the
 * admin must explicitly migrate before resync works.
 */
export async function forceResyncAction(id: string): Promise<NewsletterActionResult> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/newsletter/${encodeURIComponent(id)}/resync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 202) {
    return {
      ok: false,
      error: await res.text().catch(() => 'failed'),
      errorCode: classify(res.status),
    };
  }
  revalidatePath('/[locale]/admin/newsletter', 'page');
  return { ok: true };
}

export async function forceUnsubscribeAction(id: string): Promise<NewsletterActionResult> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/newsletter/${encodeURIComponent(id)}/unsubscribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      error: await res.text().catch(() => 'failed'),
      errorCode: classify(res.status),
    };
  }
  revalidatePath('/[locale]/admin/newsletter', 'page');
  return { ok: true };
}

export async function deleteSubscriberAction(id: string): Promise<NewsletterActionResult> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/newsletter/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      error: await res.text().catch(() => 'failed'),
      errorCode: classify(res.status),
    };
  }
  revalidatePath('/[locale]/admin/newsletter', 'page');
  return { ok: true };
}
