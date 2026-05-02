import type { Product } from '@repo/types';

export class ProductEntity implements Product {
  id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  price!: number;
  stock!: number;
  isActive!: boolean;
  categoryId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
