import { z } from 'zod';

export const ConversationStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const MessageSenderSchema = z.enum(['CUSTOMER', 'ADMIN', 'SYSTEM']);
export type MessageSender = z.infer<typeof MessageSenderSchema>;

export interface Conversation {
  id: string;
  customerId: string | null;
  guestSession: string | null;
  status: ConversationStatus;
  subject: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  guestSession: z.string().nullable(),
  status: ConversationStatusSchema,
  subject: z.string().nullable(),
  lastMessageAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Conversation>;

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  senderUserId: string | null;
  body: string;
  readByCustomer: boolean;
  readByAdmin: boolean;
  createdAt: Date;
}

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sender: MessageSenderSchema,
  senderUserId: z.string().nullable(),
  body: z.string(),
  readByCustomer: z.boolean(),
  readByAdmin: z.boolean(),
  createdAt: z.date(),
}) satisfies z.ZodType<Message>;
