import type { Conversation, Message } from '@repo/types';

let conversationCounter = 0;
let messageCounter = 0;

export function createMockConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  const n = ++conversationCounter;
  return {
    id: `conv-${String(n)}`,
    customerId: `user-${String(n)}`,
    guestSession: null,
    status: 'OPEN',
    subject: null,
    lastMessageAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockMessage(overrides: Partial<Message> = {}): Message {
  const n = ++messageCounter;
  return {
    id: `msg-${String(n)}`,
    conversationId: 'conv-1',
    sender: 'CUSTOMER',
    senderUserId: 'user-1',
    body: `Test message ${String(n)}`,
    readByCustomer: true,
    readByAdmin: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}
