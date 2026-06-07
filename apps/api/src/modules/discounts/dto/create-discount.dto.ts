import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { DiscountCode } from '@repo/types';

/**
 * XOR invariant — exactly one of percentOff / amountOff must be set — is NOT
 * enforced here. class-validator has no clean "exactly-one-of" decorator; the
 * service layer (DiscountsService.create / .update) raises BadRequest when
 * both or neither are present.
 */
export class CreateDiscountDto implements Pick<DiscountCode, 'code'> {
  @ApiProperty({ example: 'SUMMER10', maxLength: 64 })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'code may only contain letters, digits, "_" and "-"',
  })
  code!: string;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @ApiPropertyOptional({ example: 5.0, minimum: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountOff?: number;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
