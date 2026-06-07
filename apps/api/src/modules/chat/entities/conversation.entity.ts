import type { Conversation, ConversationStatus } from '@repo/types';

export class ConversationEntity implements Conversation {
  id!: string;
  customerId!: string | null;
  guestSession!: string | null;
  status!: ConversationStatus;
  subject!: string | null;
  lastMessageAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
