import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ConversationEntity } from '../entities/conversation.entity';

import { ConversationResponseDto } from './conversation-response.dto';

export class ConversationListItemResponseDto extends ConversationResponseDto {
  @ApiPropertyOptional({ example: 'Hi, do you ship…', nullable: true })
  preview!: string | null;

  @ApiProperty({ example: 3 })
  unreadForAdmin!: number;

  static fromRow(row: {
    entity: ConversationEntity;
    preview: string | null;
    unreadForAdmin: number;
  }): ConversationListItemResponseDto {
    const base = ConversationResponseDto.from(row.entity);
    const dto = new ConversationListItemResponseDto();
    Object.assign(dto, base);
    dto.preview = row.preview;
    dto.unreadForAdmin = row.unreadForAdmin;
    return dto;
  }
}
