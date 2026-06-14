import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { StubSearchProvider } from './stub.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('StubSearchProvider', () => {
  let provider: StubSearchProvider;

  beforeEach(() => {
    provider = new StubSearchProvider(
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
  });

  it('search returns empty result and logs', async () => {
    const result = await provider.search({
      query: 'anything',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: [], total: 0 });
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'search.provider.stub.search_called',
      }),
    );
  });

  it('suggest returns empty array and logs', async () => {
    const result = await provider.suggest('wir', 5);
    expect(result).toEqual({ suggestions: [] });
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'search.provider.stub.suggest_called',
      }),
    );
  });

  it('reindex returns { reindexed: 0 } and logs', async () => {
    const result = await provider.reindex();
    expect(result).toEqual({ reindexed: 0 });
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'search.provider.stub.reindex_called',
      }),
    );
  });
});
