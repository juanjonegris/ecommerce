'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface PresignResponse {
  imageId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  publicUrl: string;
  expiresAt: string;
  mode: 's3' | 'stub';
}

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

/**
 * Step 1 of the presigned-upload flow. Returns the bearer-signed URL the
 * browser PUTs the raw bytes to in step 2 (image-manager.tsx handles that
 * client-side because the file blob can't survive a Server Action boundary).
 * Step 3 (confirm) runs as a separate action so revalidatePath fires once.
 */
export async function presignImageAction(input: {
  productId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}): Promise<PresignResponse> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/uploads/product-images/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`presign failed: ${String(res.status)} ${detail}`);
  }
  return (await res.json()) as PresignResponse;
}

export async function confirmImageAction(imageId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(
    `${API_URL}/uploads/product-images/${encodeURIComponent(imageId)}/confirm`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`confirm failed: ${String(res.status)} ${detail}`);
  }
  revalidatePath('/[locale]/admin/products', 'page');
}
