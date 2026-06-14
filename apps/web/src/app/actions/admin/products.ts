'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import type { Product } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const ProductInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  price: z.coerce.number().nonnegative(),
  categoryId: z.string().min(1),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;

export interface ProductFormState {
  error?: string;
  fieldErrors?: Partial<Record<keyof ProductInput, string>>;
}

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

function fieldErrorsFromZod(
  err: z.ZodError<ProductInput>,
): Partial<Record<keyof ProductInput, string>> {
  const out: Partial<Record<keyof ProductInput, string>> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      out[key as keyof ProductInput] = issue.message;
    }
  }
  return out;
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = ProductInputSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? null,
    price: formData.get('price'),
    categoryId: formData.get('categoryId'),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const token = await getToken();
  const res = await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text();
    return { error: `create failed: ${String(res.status)} ${detail}` };
  }
  const product = (await res.json()) as Product;
  revalidatePath('/[locale]/admin/products', 'page');
  return { fieldErrors: { name: `__created:${product.slug}` } };
  // Caller form keys off fieldErrors.name starting with __created: to redirect.
  // (Server Action redirect()-on-success is awkward with useActionState because
  // redirect() throws; we surface the slug as a sentinel instead.)
}

export async function updateProductAction(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = ProductInputSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? null,
    price: formData.get('price'),
    categoryId: formData.get('categoryId'),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const token = await getToken();
  const res = await fetch(`${API_URL}/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text();
    return { error: `update failed: ${String(res.status)} ${detail}` };
  }
  const product = (await res.json()) as Product;
  revalidatePath('/[locale]/admin/products', 'page');
  revalidatePath(`/[locale]/admin/products/${product.slug}`, 'page');
  return {};
}

export async function deleteProductAction(id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`delete failed: ${String(res.status)}`);
  }
  revalidatePath('/[locale]/admin/products', 'page');
}

export async function reorderImagesAction(
  productId: string,
  items: { id: string; order: number }[],
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/uploads/product-images/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ productId, items }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`reorder failed: ${String(res.status)}`);
  }
  revalidatePath('/[locale]/admin/products', 'page');
}

export async function deleteImageAction(imageId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/uploads/product-images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`delete image failed: ${String(res.status)}`);
  }
  revalidatePath('/[locale]/admin/products', 'page');
}
