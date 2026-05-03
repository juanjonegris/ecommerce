'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Stub Server Action — the NestJS /cart/items endpoint is not implemented yet.
// Wire-frame matches CLAUDE.md §8 Pattern 2.
export async function addToCartAction(productId: string, quantity: number): Promise<void> {
  const token = (await cookies()).get('session')?.value;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/cart/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId, quantity }),
  });
  if (!res.ok) throw new Error(`Failed to add to cart: ${String(res.status)}`);
  revalidatePath('/cart');
}
