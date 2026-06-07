import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ConversationStatus } from '@repo/types';

import type { ConversationEntity } from '../entities/conversation.entity';

export class ConversationResponseDto {
  @ApiProperty({ example: 'clconv0000000000000000000' })
  id!: string;

  @ApiPropertyOptional({ example: 'cluser0000000000000000000', nullable: true })
  customerId!: string | null;

  @ApiPropertyOptional({
    example: '7f8f3c0a-9b1e-4f6c-9d2e-1a2b3c4d5e6f',
    nullable: true,
  })
  guestSession!: string | null;

  @ApiProperty({ enum: ['OPEN', 'CLOSED'], example: 'OPEN' })
  status!: ConversationStatus;

  @ApiPropertyOptional({ example: 'Shipping question', nullable: true })
  subject!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  lastMessageAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(entity: ConversationEntity): ConversationResponseDto {
    const dto = new ConversationResponseDto();
    dto.id = entity.id;
    dto.customerId = entity.customerId;
    dto.guestSession = entity.guestSession;
    dto.status = entity.status;
    dto.subject = entity.subject;
    dto.lastMessageAt = entity.lastMessageAt.toISOString();
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
