import { NotFoundException, type LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import type { CategoriesRepository } from '@/modules/categories/categories.repository';
import type { ProductsRepository } from '@/modules/products/products.repository';

import { createMockCategory } from '../../../test/factories/category.factory';
import { createMockProduct } from '../../../test/factories/product.factory';

import type { SearchProviderAdapter } from './providers/search-provider.interface';
import { SearchService } from './search.service';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeProductsRepo(): jest.Mocked<
  Pick<ProductsRepository, 'findManyByIds'>
> {
  return { findManyByIds: jest.fn() };
}

function makeCategoriesRepo(): jest.Mocked<
  Pick<CategoriesRepository, 'findById'>
> {
  return { findById: jest.fn() };
}

function makeProvider(): jest.Mocked<SearchProviderAdapter> {
  return {
    name: 'postgres-fts',
    search: jest.fn(),
    suggest: jest.fn(),
    reindex: jest.fn(),
  } as unknown as jest.Mocked<SearchProviderAdapter>;
}

function makeConfig(maxQueryLength = 200): ConfigService {
  return {
    get: jest.fn((key: string): unknown => {
      if (key === 'SEARCH_MAX_QUERY_LENGTH') return maxQueryLength;
      return undefined;
    }),
  } as unknown as ConfigService;
}

interface Harness {
  service: SearchService;
  provider: jest.Mocked<SearchProviderAdapter>;
  productsRepo: ReturnType<typeof makeProductsRepo>;
  categoriesRepo: ReturnType<typeof makeCategoriesRepo>;
}

function makeHarness(maxQueryLength = 200): Harness {
  const provider = makeProvider();
  const productsRepo = makeProductsRepo();
  const categoriesRepo = makeCategoriesRepo();
  const service = new SearchService(
    provider,
    productsRepo as unknown as ProductsRepository,
    categoriesRepo as unknown as CategoriesRepository,
    makeConfig(maxQueryLength),
    mockLogger as unknown as LoggerService,
    mockCls as unknown as ClsService,
  );
  return { service, provider, productsRepo, categoriesRepo };
}

describe('SearchService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('empty string short-circuits — no provider call', async () => {
      const { service, provider } = makeHarness();
      const result = await service.search({ query: '', page: 1, limit: 20 });
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(provider.search).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'search.service.search_short_circuit_empty',
        }),
      );
    });

    it('whitespace-only short-circuits', async () => {
      const { service, provider } = makeHarness();
      await service.search({ query: '   \t  ', page: 1, limit: 20 });
      expect(provider.search).not.toHaveBeenCalled();
    });

    it('oversized query is truncated silently to the cap', async () => {
      const { service, provider, productsRepo } = makeHarness(50);
      provider.search.mockResolvedValue({ items: [], total: 0 });
      productsRepo.findManyByIds.mockResolvedValue([]);
      const long = 'a'.repeat(500);
      await service.search({ query: long, page: 1, limit: 20 });
      const call = provider.search.mock.calls[0]?.[0];
      expect(call?.query.length).toBe(50);
    });

    it('happy path hydrates and preserves provider order', async () => {
      const { service, provider, productsRepo } = makeHarness();
      provider.search.mockResolvedValue({
        items: [
          { productId: 'p2', score: 0.9, snippet: null },
          { productId: 'p1', score: 0.5, snippet: '<mark>foo</mark>' },
        ],
        total: 2,
      });
      // Repo returns rows in DIFFERENT order — service must re-sort.
      productsRepo.findManyByIds.mockResolvedValue([
        createMockProduct({ id: 'p1' }),
        createMockProduct({ id: 'p2' }),
      ]);
      const result = await service.search({
        query: 'foo',
        page: 1,
        limit: 20,
      });
      expect(result.data.map((d) => d.product.id)).toEqual(['p2', 'p1']);
      expect(result.total).toBe(2);
    });

    it('valid categoryId triggers categoriesRepository lookup', async () => {
      const { service, provider, productsRepo, categoriesRepo } = makeHarness();
      categoriesRepo.findById.mockResolvedValue(
        createMockCategory({ id: 'cat-1' }),
      );
      provider.search.mockResolvedValue({ items: [], total: 0 });
      productsRepo.findManyByIds.mockResolvedValue([]);
      await service.search({
        query: 'foo',
        page: 1,
        limit: 20,
        categoryId: 'cat-1',
      });
      expect(categoriesRepo.findById).toHaveBeenCalledWith('cat-1');
      expect(provider.search).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1' }),
      );
    });

    it('missing category throws NotFoundException', async () => {
      const { service, categoriesRepo, provider } = makeHarness();
      categoriesRepo.findById.mockResolvedValue(null);
      await expect(
        service.search({
          query: 'foo',
          page: 1,
          limit: 20,
          categoryId: 'gone',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(provider.search).not.toHaveBeenCalled();
    });

    it('products missing from hydration are silently dropped', async () => {
      const { service, provider, productsRepo } = makeHarness();
      provider.search.mockResolvedValue({
        items: [
          { productId: 'p1', score: 0.5, snippet: null },
          { productId: 'gone', score: 0.3, snippet: null },
        ],
        total: 2,
      });
      productsRepo.findManyByIds.mockResolvedValue([
        createMockProduct({ id: 'p1' }),
      ]);
      const result = await service.search({
        query: 'foo',
        page: 1,
        limit: 20,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.product.id).toBe('p1');
      // total stays at the provider's reported total (we still want pagination
      // to reflect the index's view of the world)
      expect(result.total).toBe(2);
    });
  });

  describe('suggest', () => {
    it('empty string short-circuits', async () => {
      const { service, provider } = makeHarness();
      const result = await service.suggest('');
      expect(result.suggestions).toEqual([]);
      expect(provider.suggest).not.toHaveBeenCalled();
    });

    it('hard-caps limit at 10', async () => {
      const { service, provider } = makeHarness();
      provider.suggest.mockResolvedValue({ suggestions: [] });
      await service.suggest('wir', 999);
      expect(provider.suggest).toHaveBeenCalledWith('wir', 10);
    });
  });

  describe('reindex', () => {
    it('delegates to provider and returns provider name + count', async () => {
      const { service, provider } = makeHarness();
      provider.reindex.mockResolvedValue({ reindexed: 42 });
      const result = await service.reindex();
      expect(result).toEqual({ provider: 'postgres-fts', reindexed: 42 });
    });
  });
});
