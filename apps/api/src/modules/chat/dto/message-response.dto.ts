import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { MessageSender } from '@repo/types';

import type { MessageEntity } from '../entities/message.entity';

export class MessageResponseDto {
  @ApiProperty({ example: 'clmsg0000000000000000000' })
  id!: string;

  @ApiProperty({ example: 'clconv0000000000000000000' })
  conversationId!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN', 'SYSTEM'], example: 'CUSTOMER' })
  sender!: MessageSender;

  @ApiPropertyOptional({ example: 'cluser0000000000000000000', nullable: true })
  senderUserId!: string | null;

  @ApiProperty({ example: 'Hi, do you ship to Argentina?' })
  body!: string;

  @ApiProperty({ example: false })
  readByCustomer!: boolean;

  @ApiProperty({ example: false })
  readByAdmin!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  static from(entity: MessageEntity): MessageResponseDto {
    const dto = new MessageResponseDto();
    dto.id = entity.id;
    dto.conversationId = entity.conversationId;
    dto.sender = entity.sender;
    dto.senderUserId = entity.senderUserId;
    dto.body = entity.body;
    dto.readByCustomer = entity.readByCustomer;
    dto.readByAdmin = entity.readByAdmin;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}
