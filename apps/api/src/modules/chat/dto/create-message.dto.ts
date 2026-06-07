import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import type { Message } from '@repo/types';

/**
 * Body is class-validated for length 1-4000, but `MinLength(1)` accepts
 * whitespace-only input — ChatService.sendMessage* trims and re-checks length
 * before persisting.
 */
export class CreateMessageDto implements Pick<Message, 'body'> {
  @ApiProperty({ example: 'Hi, do you ship to Argentina?', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
