import type { Category } from '@repo/types';

let counter = 0;

export function createMockCategory(
  overrides: Partial<Category> = {},
): Category {
  const n = ++counter;
  return {
    id: `category-${String(n)}`,
    name: `Test Category ${String(n)}`,
    slug: `test-category-${String(n)}`,
    parentId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
