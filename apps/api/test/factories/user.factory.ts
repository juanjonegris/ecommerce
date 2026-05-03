import type { User, UserRole } from '@repo/types';

export interface MockUser extends User {
  passwordHash: string;
}

let counter = 0;

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const n = ++counter;
  return {
    id: `user-${String(n)}`,
    email: `user-${String(n)}@example.com`,
    role: 'CUSTOMER' satisfies UserRole,
    passwordHash:
      '$2b$12$abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyzABCDE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
