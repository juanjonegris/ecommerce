import { z } from 'zod';

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  parentId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
