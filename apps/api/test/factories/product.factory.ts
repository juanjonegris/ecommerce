import type { Product } from '@repo/types';

let counter = 0;

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  const n = ++counter;
  return {
    id: `product-${String(n)}`,
    name: `Test Product ${String(n)}`,
    slug: `test-product-${String(n)}`,
    description: null,
    price: 29.99,
    stock: 100,
    isActive: true,
    categoryId: `category-${String(n)}`,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
