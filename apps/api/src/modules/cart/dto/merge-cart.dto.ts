import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MergeCartDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-4000-8000-000000000000' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
