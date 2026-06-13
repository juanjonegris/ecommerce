import { z } from 'zod';

export const ProductImageStatusSchema = z.enum(['PENDING_UPLOAD', 'READY']);
export type ProductImageStatus = z.infer<typeof ProductImageStatusSchema>;

/**
 * Public product-image shape. `storageKey` is internal-only — the API
 * response DTO strips it. (We still expose it on the shared type because
 * the admin entity uses it for delete/HEAD calls inside the backend.)
 */
export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  order: number;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: ProductImageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductImageSchema = z.object({
  id: z.string(),
  productId: z.string(),
  url: z.string(),
  order: z.number().int().nonnegative(),
  storageKey: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  status: ProductImageStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<ProductImage>;

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  isActive: z.boolean(),
  categoryId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
