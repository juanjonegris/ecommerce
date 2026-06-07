import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { ConversationStatus } from '@repo/types';

export class UpdateConversationDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'], example: 'CLOSED' })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: ConversationStatus;

  @ApiPropertyOptional({ example: 'Shipping question', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
