import { createMockProduct } from '../../../test/factories/product.factory';

import { SearchController } from './search.controller';
import type { SearchService } from './search.service';

function makeService(): jest.Mocked<
  Pick<SearchService, 'search' | 'suggest' | 'reindex'>
> {
  return {
    search: jest.fn(),
    suggest: jest.fn(),
    reindex: jest.fn(),
  };
}

describe('SearchController', () => {
  let service: ReturnType<typeof makeService>;
  let controller: SearchController;

  beforeEach(() => {
    service = makeService();
    controller = new SearchController(service as unknown as SearchService);
    jest.clearAllMocks();
  });

  it('GET / returns paginated shape with embedded ProductResponseDto', async () => {
    const product = createMockProduct({ id: 'p1', name: 'Test', slug: 't' });
    service.search.mockResolvedValue({
      data: [{ product, score: 0.42, snippet: '<mark>Test</mark>' }],
      total: 1,
      page: 1,
      limit: 20,
    });
    const result = await controller.search({
      q: 'test',
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.data[0]?.product.id).toBe('p1');
    expect(result.data[0]?.product.slug).toBe('t');
    expect(result.data[0]?.score).toBe(0.42);
    expect(result.data[0]?.snippet).toBe('<mark>Test</mark>');
  });

  it('GET / passes categoryId through when present', async () => {
    service.search.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await controller.search({ q: 'foo', categoryId: 'cat-1' });
    expect(service.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'foo', categoryId: 'cat-1' }),
    );
  });

  it('GET / omits categoryId field when undefined', async () => {
    service.search.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await controller.search({ q: 'foo' });
    const call = service.search.mock.calls[0]?.[0];
    expect(call && 'categoryId' in call).toBe(false);
  });

  it('GET /suggest returns { suggestions: [...] }', async () => {
    service.suggest.mockResolvedValue({
      suggestions: [
        { name: 'Wireless Headphones', slug: 'wireless-headphones' },
      ],
    });
    const result = await controller.suggest({ q: 'wir' });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.slug).toBe('wireless-headphones');
  });

  it('POST /reindex delegates to service.reindex', async () => {
    service.reindex.mockResolvedValue({
      provider: 'postgres-fts',
      reindexed: 42,
    });
    const result = await controller.reindex();
    expect(result).toEqual({ provider: 'postgres-fts', reindexed: 42 });
  });
});
