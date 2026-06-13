import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import type { NewsletterSource } from '@repo/types';

const SOURCES = ['FOOTER', 'CHECKOUT', 'POPUP', 'ADMIN', 'UNKNOWN'] as const;

export class SubscribeDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    String(value).trim().toLowerCase(),
  )
  email!: string;

  @ApiPropertyOptional({ enum: SOURCES, example: 'FOOTER' })
  @IsOptional()
  @IsIn(SOURCES)
  source?: NewsletterSource;

  @ApiPropertyOptional({ example: 'en', maxLength: 8 })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({ type: [String], example: ['vip', 'launch-2026'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
