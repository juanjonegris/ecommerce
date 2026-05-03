import type { UserRole } from '@repo/types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}
