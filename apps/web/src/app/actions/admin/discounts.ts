'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import type { DiscountCode } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Backend code regex matches /^[A-Z0-9_-]+$/i + 3-64 chars.
const DiscountInputSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, {
        message: 'code may only contain letters, digits, "_" and "-"',
      }),
    percentOff: z.number().int().min(1).max(100).optional(),
    amountOff: z.number().min(0.01).optional(),
    expiresAt: z.string().optional(),
  })
  .refine(
    (d) =>
      (d.percentOff !== undefined && d.amountOff === undefined) ||
      (d.percentOff === undefined && d.amountOff !== undefined),
    { message: 'exactly one of percentOff or amountOff must be set' },
  );

export type DiscountInput = z.infer<typeof DiscountInputSchema>;

export interface DiscountFormState {
  error?: string;
  fieldErrors?: Partial<Record<keyof DiscountInput | 'general', string>>;
  createdId?: string;
}

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

function stringField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

function parseFromFormData(formData: FormData): DiscountInput | null {
  const code = stringField(formData, 'code');
  const type = stringField(formData, 'type');
  const expiresAtRaw = stringField(formData, 'expiresAt').trim();

  const base: Partial<DiscountInput> = { code };
  if (expiresAtRaw) {
    // <input type="date"> emits YYYY-MM-DD — convert to ISO with end-of-day UTC
    // so a discount expiring "Dec 31" actually expires at midnight UTC after
    // Dec 31, not at the start of the day.
    base.expiresAt = `${expiresAtRaw}T23:59:59.000Z`;
  }
  if (type === 'percent') {
    const v = Number(stringField(formData, 'percentOff'));
    if (!Number.isFinite(v)) return null;
    base.percentOff = v;
  } else if (type === 'amount') {
    const v = Number(stringField(formData, 'amountOff'));
    if (!Number.isFinite(v)) return null;
    base.amountOff = v;
  } else {
    return null;
  }

  const parsed = DiscountInputSchema.safeParse(base);
  return parsed.success ? parsed.data : null;
}

export async function createDiscountAction(
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const input = parseFromFormData(formData);
  if (!input) {
    return { error: 'invalid input' };
  }
  const token = await getToken();
  const res = await fetch(`${API_URL}/discounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => 'failed');
    return { error: `create failed: ${String(res.status)} ${detail}` };
  }
  const discount = (await res.json()) as DiscountCode;
  revalidatePath('/[locale]/admin/discounts', 'page');
  return { createdId: discount.id };
}

export async function updateDiscountAction(
  id: string,
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const input = parseFromFormData(formData);
  if (!input) {
    return { error: 'invalid input' };
  }
  const token = await getToken();
  const res = await fetch(`${API_URL}/discounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => 'failed');
    return { error: `update failed: ${String(res.status)} ${detail}` };
  }
  revalidatePath('/[locale]/admin/discounts', 'page');
  revalidatePath(`/[locale]/admin/discounts/${id}`, 'page');
  return {};
}

export async function deleteDiscountAction(id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/discounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`delete failed: ${String(res.status)}`);
  }
  revalidatePath('/[locale]/admin/discounts', 'page');
}
