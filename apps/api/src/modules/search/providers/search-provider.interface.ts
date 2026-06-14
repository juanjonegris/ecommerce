/** Verified, normalized search input passed to a provider. The service
 *  trims + length-caps the query and validates categoryId BEFORE calling. */
export interface SearchInput {
  query: string;
  /** 1-indexed. */
  page: number;
  /** 1-50. */
  limit: number;
  categoryId?: string;
  /** Informational only — the postgres-fts impl ignores it. A future
   *  Meilisearch / Algolia impl may use it to route to a per-locale index. */
  locale?: string;
}

/** Provider-shaped result item — service hydrates productId via
 *  ProductsRepository.findManyByIds and re-sorts in JS to match this order. */
export interface ProviderSearchResultItem {
  productId: string;
  score: number;
  snippet: string | null;
}

export interface ProviderSearchResult {
  items: ProviderSearchResultItem[];
  total: number;
}

export interface ProviderSuggestResult {
  suggestions: { name: string; slug: string }[];
}

/**
 * Search-provider port. Swap implementations (Meilisearch, Typesense, …)
 * by binding a different class to SEARCH_PROVIDER in SearchModule — no
 * caller changes required.
 */
export interface SearchProviderAdapter {
  readonly name: 'postgres-fts' | 'stub';
  search(input: SearchInput): Promise<ProviderSearchResult>;
  suggest(prefix: string, limit: number): Promise<ProviderSuggestResult>;
  /** Bulk repopulate the provider's index. PostgresFts: no-op (the
   *  generated tsvector column updates automatically); returns
   *  `{ reindexed: <count of active products> }` for admin visibility. */
  reindex(): Promise<{ reindexed: number }>;
}

/** DI token for the SearchProviderAdapter interface. */
export const SEARCH_PROVIDER = 'SEARCH_PROVIDER';
