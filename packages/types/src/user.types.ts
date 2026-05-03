import { z } from 'zod';

export const UserRoleSchema = z.enum(['CUSTOMER', 'STAFF', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().nonnegative(),
});
