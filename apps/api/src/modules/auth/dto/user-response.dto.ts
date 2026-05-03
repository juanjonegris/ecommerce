import { ApiProperty } from '@nestjs/swagger';

import type { User, UserRole } from '@repo/types';

export class UserResponseDto {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  id!: string;

  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({ example: 'CUSTOMER', enum: ['CUSTOMER', 'STAFF', 'ADMIN'] })
  role!: UserRole;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: string;

  static from(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.role = user.role;
    dto.createdAt = user.createdAt.toISOString();
    dto.updatedAt = user.updatedAt.toISOString();
    return dto;
  }
}
