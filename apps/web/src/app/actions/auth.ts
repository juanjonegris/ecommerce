'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { AuthTokens } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface LoginState {
  error?: string;
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};

/**
 * useActionState signature: (prevState, formData) => Promise<State>.
 * Returns { error } on failure so the form can render it; on success
 * writes the session cookie and redirects (redirect throws — never
 * returns, so the success path doesn't produce a state object).
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  // formData.get returns FormDataEntryValue | null; the hidden inputs we
  // emit are always strings, but TS doesn't know that — narrow explicitly.
  const rawLocale = formData.get('locale');
  const locale = typeof rawLocale === 'string' ? rawLocale : 'en';
  const rawNext = formData.get('next');
  const next = typeof rawNext === 'string' ? rawNext : `/${locale}/admin`;

  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'invalid' };
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (!res.ok) {
    return { error: 'invalid' };
  }
  const tokens = (await res.json()) as AuthTokens;

  const store = await cookies();
  store.set(SESSION_COOKIE, tokens.accessToken, SESSION_COOKIE_OPTS);

  // redirect() throws — must sit outside try/catch and after the cookie write.
  redirect(next);
}

export async function logoutAction(locale: string): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect(`/${locale}`);
}
