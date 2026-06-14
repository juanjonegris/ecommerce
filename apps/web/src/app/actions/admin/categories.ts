'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import type { Category } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().optional().nullable(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().optional().nullable(),
});

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

function readBody(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

export interface CategoryActionResult {
  ok: boolean;
  error?: string;
  errorCode?: 'CONFLICT' | 'INVALID' | 'UNKNOWN';
  category?: Category;
}

type ErrorCode = 'CONFLICT' | 'INVALID' | 'UNKNOWN';

function classifyError(status: number): ErrorCode {
  if (status === 409) return 'CONFLICT';
  if (status === 400 || status === 404) return 'INVALID';
  return 'UNKNOWN';
}

export async function createCategoryAction(input: {
  name: string;
  parentId?: string | null;
}): Promise<CategoryActionResult> {
  const parsed = CreateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid input', errorCode: 'INVALID' };
  }
  const token = await getToken();
  // The backend's CreateCategoryDto doesn't accept null parentId — strip it.
  const body: { name: string; parentId?: string } = { name: parsed.data.name };
  if (parsed.data.parentId) body.parentId = parsed.data.parentId;

  const res = await fetch(`${API_URL}/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      error: await readBody(res),
      errorCode: classifyError(res.status),
    };
  }
  const category = (await res.json()) as Category;
  revalidatePath('/[locale]/admin/categories', 'page');
  return { ok: true, category };
}

export async function updateCategoryAction(
  id: string,
  input: { name?: string; parentId?: string | null },
): Promise<CategoryActionResult> {
  const parsed = UpdateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid input', errorCode: 'INVALID' };
  }
  const token = await getToken();
  const res = await fetch(`${API_URL}/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      error: await readBody(res),
      errorCode: classifyError(res.status),
    };
  }
  const category = (await res.json()) as Category;
  revalidatePath('/[locale]/admin/categories', 'page');
  return { ok: true, category };
}

export async function deleteCategoryAction(id: string): Promise<CategoryActionResult> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      error: await readBody(res),
      errorCode: classifyError(res.status),
    };
  }
  revalidatePath('/[locale]/admin/categories', 'page');
  return { ok: true };
}
