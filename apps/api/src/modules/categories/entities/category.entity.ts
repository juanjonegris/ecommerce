import type { Category } from '@repo/types';

export class CategoryEntity implements Category {
  id!: string;
  name!: string;
  slug!: string;
  parentId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  // Populated only by tree queries (findRoots); flat queries leave it undefined.
  children?: CategoryEntity[];
}
