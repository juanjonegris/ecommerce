import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { NewsletterStatus, NewsletterSyncState } from '@repo/types';

const STATUSES = ['PENDING', 'CONFIRMED', 'UNSUBSCRIBED'] as const;
const SYNC_STATES = [
  'SYNCED',
  'PENDING_SYNC',
  'FAILED',
  'NOT_APPLICABLE',
] as const;
const PROVIDERS = ['mailchimp', 'klaviyo', 'stub'] as const;

export class FindNewsletterQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: NewsletterStatus;

  @ApiPropertyOptional({ enum: SYNC_STATES })
  @IsOptional()
  @IsIn(SYNC_STATES)
  syncState?: NewsletterSyncState;

  @ApiPropertyOptional({ enum: PROVIDERS })
  @IsOptional()
  @IsIn(PROVIDERS)
  provider?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive email substring match',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
