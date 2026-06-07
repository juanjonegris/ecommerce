import type { Message, MessageSender } from '@repo/types';

export class MessageEntity implements Message {
  id!: string;
  conversationId!: string;
  sender!: MessageSender;
  senderUserId!: string | null;
  body!: string;
  readByCustomer!: boolean;
  readByAdmin!: boolean;
  createdAt!: Date;
}
