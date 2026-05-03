import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import type { User } from '@repo/types';

export class RegisterDto implements Pick<User, 'email'> {
  @ApiProperty({ example: 'jane@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: 8,
    maxLength: 128,
    description:
      'Min 8 chars, must contain at least one letter and one number.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}
