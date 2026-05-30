import type { Cart, CartItem } from '@repo/types';

let counter = 0;

export function createMockCartItem(
  overrides: Partial<CartItem> = {},
): CartItem {
  const n = ++counter;
  return {
    productId: `product-${String(n)}`,
    name: `Test Product ${String(n)}`,
    slug: `test-product-${String(n)}`,
    price: 29.99,
    quantity: 1,
    ...overrides,
  };
}

export function createMockCart(overrides: Partial<Cart> = {}): Cart {
  return {
    items: [],
    ...overrides,
  };
}
