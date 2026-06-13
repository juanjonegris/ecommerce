import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UnsubscribeDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    String(value).trim().toLowerCase(),
  )
  email!: string;

  @ApiPropertyOptional({
    description: 'Single-use unsubscribe token from a previous email',
    minLength: 64,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]+$/)
  token?: string;
}
