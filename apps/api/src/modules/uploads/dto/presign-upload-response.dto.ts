import { ApiProperty } from '@nestjs/swagger';

export class PresignUploadResponseDto {
  @ApiProperty({ example: 'cm0imageabc' })
  imageId!: string;

  @ApiProperty({
    example:
      'http://localhost:9000/bucket/product-images/p1/abc.jpg?X-Amz-Signature=…',
  })
  uploadUrl!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { 'Content-Type': 'image/jpeg', 'Content-Length': '524288' },
  })
  requiredHeaders!: Record<string, string>;

  @ApiProperty({
    example: 'http://localhost:9000/bucket/product-images/p1/abc.jpg',
  })
  publicUrl!: string;

  @ApiProperty({ example: '2026-06-13T12:05:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ enum: ['s3', 'stub'], example: 's3' })
  mode!: 's3' | 'stub';
}
