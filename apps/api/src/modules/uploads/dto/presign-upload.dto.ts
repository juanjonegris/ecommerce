import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Hard defensive ceiling — class-validator can't read env at decorator-bind
 * time. The service does the env-aware re-check against UPLOAD_MAX_BYTES.
 */
const HARD_MAX_BYTES = 26_214_400;

export class PresignUploadDto {
  @ApiProperty({ example: 'cm0xyzabc' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 'hero.jpg', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @Matches(/^image\/(jpeg|png|webp|avif)$/)
  mimeType!: string;

  @ApiProperty({ example: 524288, minimum: 1, maximum: HARD_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(HARD_MAX_BYTES)
  sizeBytes!: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  width?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  height?: number;
}
