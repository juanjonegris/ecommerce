import {
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { SearchSuggestion } from '@repo/types';

import type { AppConfig } from '@/config/configuration';
import { CategoriesRepository } from '@/modules/categories/categories.repository';
import type { ProductEntity } from '@/modules/products/entities/product.entity';
import { ProductsRepository } from '@/modules/products/products.repository';

import {
  SEARCH_PROVIDER,
  type SearchProviderAdapter,
} from './providers/search-provider.interface';

const SUGGEST_HARD_CAP = 10;

export interface SearchServiceInput {
  query: string;
  page: number;
  limit: number;
  categoryId?: string;
  locale?: string;
}

export interface SearchServiceResultItem {
  product: ProductEntity;
  score: number;
  snippet: string | null;
}

export interface SearchServiceResult {
  data: SearchServiceResultItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_PROVIDER)
    private readonly provider: SearchProviderAdapter,
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async search(input: SearchServiceInput): Promise<SearchServiceResult> {
    const requestId = this.cls.getId();
    const start = Date.now();

    const trimmed = input.query.trim();
    if (trimmed.length === 0) {
      this.logger.log({
        message: 'search.service.search_short_circuit_empty',
        requestId,
      });
      return { data: [], total: 0, page: input.page, limit: input.limit };
    }

    const query = this.maybeTruncate(trimmed, requestId);

    if (input.categoryId !== undefined) {
      const cat = await this.categoriesRepository.findById(input.categoryId);
      if (!cat) {
        this.logger.warn({
          message: 'search.service.category_filter_invalid',
          requestId,
          categoryId: input.categoryId,
        });
        throw new NotFoundException(`Category "${input.categoryId}" not found`);
      }
    }

    this.logger.log({
      message: 'search.service.search_started',
      requestId,
      queryPreview: query.slice(0, 50),
      page: input.page,
      limit: input.limit,
    });

    const providerResult = await this.provider.search({
      query,
      page: input.page,
      limit: input.limit,
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    });

    const ids = providerResult.items.map((i) => i.productId);
    const products = await this.productsRepository.findManyByIds(ids);
    const byId = new Map(products.map((p) => [p.id, p]));

    // Preserve provider's score order (D7). Products that disappeared
    // between FTS rank and hydration (concurrent delete) are silently
    // dropped — search index can briefly outlive a delete; we do NOT 500.
    const data: SearchServiceResultItem[] = [];
    for (const item of providerResult.items) {
      const product = byId.get(item.productId);
      if (product) {
        data.push({ product, score: item.score, snippet: item.snippet });
      }
    }

    this.logger.log({
      message: 'search.service.search_succeeded',
      requestId,
      totalReturned: data.length,
      total: providerResult.total,
      latencyMs: Date.now() - start,
    });

    return {
      data,
      total: providerResult.total,
      page: input.page,
      limit: input.limit,
    };
  }

  async suggest(
    prefix: string,
    limit?: number,
  ): Promise<{ suggestions: SearchSuggestion[] }> {
    const requestId = this.cls.getId();
    const trimmed = prefix.trim();
    if (trimmed.length === 0) {
      this.logger.log({
        message: 'search.service.suggest_short_circuit_empty',
        requestId,
      });
      return { suggestions: [] };
    }
    const effectiveLimit = Math.min(limit ?? 8, SUGGEST_HARD_CAP);
    this.logger.log({
      message: 'search.service.suggest_started',
      requestId,
      prefix: trimmed.slice(0, 50),
      limit: effectiveLimit,
    });
    const result = await this.provider.suggest(trimmed, effectiveLimit);
    this.logger.log({
      message: 'search.service.suggest_succeeded',
      requestId,
      returned: result.suggestions.length,
    });
    return result;
  }

  async reindex(): Promise<{
    provider: 'postgres-fts' | 'stub';
    reindexed: number;
  }> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'search.service.reindex_started',
      requestId,
      provider: this.provider.name,
    });
    const result = await this.provider.reindex();
    this.logger.log({
      message: 'search.service.reindex_succeeded',
      requestId,
      provider: this.provider.name,
      reindexed: result.reindexed,
    });
    return { provider: this.provider.name, reindexed: result.reindexed };
  }

  private maybeTruncate(query: string, requestId: string | undefined): string {
    const cap = this.maxQueryLength();
    if (query.length <= cap) return query;
    this.logger.warn({
      message: 'search.service.search_truncated',
      requestId,
      original: query.length,
      cap,
    });
    return query.slice(0, cap);
  }

  private maxQueryLength(): number {
    return (
      this.config.get<AppConfig['SEARCH_MAX_QUERY_LENGTH']>(
        'SEARCH_MAX_QUERY_LENGTH',
      ) ?? 200
    );
  }
}
