import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class ConfirmQueryDto {
  @ApiProperty({
    description: '64-char lowercase hex confirmation token',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]+$/)
  token!: string;
}
