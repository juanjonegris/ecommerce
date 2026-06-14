'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { Conversation, Message } from '@repo/types';

import { SESSION_COOKIE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function getToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('not authenticated');
  return token;
}

export async function replyAction(conversationId: string, body: string): Promise<Message> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error('reply body cannot be empty');
  }
  const token = await getToken();
  const res = await fetch(`${API_URL}/chat/${encodeURIComponent(conversationId)}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ body: trimmed }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => 'failed');
    throw new Error(`reply failed: ${String(res.status)} ${detail}`);
  }
  return (await res.json()) as Message;
}

export async function markReadAction(conversationId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/chat/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`markRead failed: ${String(res.status)}`);
  }
}

export async function closeConversationAction(conversationId: string): Promise<Conversation> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/chat/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: 'CLOSED' }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => 'failed');
    throw new Error(`close failed: ${String(res.status)} ${detail}`);
  }
  revalidatePath('/[locale]/admin/chat', 'page');
  return (await res.json()) as Conversation;
}
