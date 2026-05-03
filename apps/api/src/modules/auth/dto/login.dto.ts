import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

import type { User } from '@repo/types';

export class LoginDto implements Pick<User, 'email'> {
  @ApiProperty({ example: 'jane@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Password123!', maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password!: string;
}
