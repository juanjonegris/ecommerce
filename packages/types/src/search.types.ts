import { z } from 'zod';

import type { Product } from './product.types';

/**
 * Generic over the product shape so the api can specialize to
 * ProductResponseDto at its boundary without decorator leakage here.
 */
export interface SearchResultItem<P = Product> {
  product: P;
  score: number;
  snippet: string | null;
}

export interface SearchSuggestion {
  name: string;
  slug: string;
}

export const SearchSuggestionSchema = z.object({
  name: z.string(),
  slug: z.string(),
}) satisfies z.ZodType<SearchSuggestion>;
