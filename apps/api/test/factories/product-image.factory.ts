import type { ProductImage } from '@repo/types';

let counter = 0;

export function createMockProductImage(
  overrides: Partial<ProductImage> = {},
): ProductImage {
  counter++;
  const n = String(counter);
  return {
    id: `pi-${n}`,
    productId: 'p-1',
    url: `http://localhost:9000/test-bucket/product-images/p-1/${n}.jpg`,
    order: 0,
    storageKey: `product-images/p-1/${n}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 200_000,
    width: null,
    height: null,
    status: 'READY',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
