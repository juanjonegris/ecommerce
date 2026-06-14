'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { Order, OrderStatus } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface OrderActionResult {
  ok: boolean;
  error?: string;
  order?: Order;
}

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

export async function updateOrderStatusAction(
  id: string,
  status: OrderStatus,
): Promise<OrderActionResult> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
    cache: 'no-store',
  });
  if (!res.ok) {
    return { ok: false, error: await res.text().catch(() => 'failed') };
  }
  const order = (await res.json()) as Order;
  revalidatePath('/[locale]/admin/orders', 'page');
  revalidatePath(`/[locale]/admin/orders/${id}`, 'page');
  return { ok: true, order };
}
