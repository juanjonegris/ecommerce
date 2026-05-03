import type { User } from '@repo/types';

export class UserEntity implements User {
  id!: string;
  email!: string;
  role!: User['role'];
  passwordHash!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
