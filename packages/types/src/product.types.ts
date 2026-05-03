import { z } from 'zod';

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  order: number;
}

export const ProductImageSchema = z.object({
  id: z.string(),
  productId: z.string(),
  url: z.string().url(),
  order: z.number().int().nonnegative(),
});

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
