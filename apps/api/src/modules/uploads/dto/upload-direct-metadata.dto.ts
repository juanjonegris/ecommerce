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
 * Metadata field sent alongside the multipart `file` field. Same shape as
 * PresignUploadDto MINUS sizeBytes (known from the buffer).
 */
export class UploadDirectMetadataDto {
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
