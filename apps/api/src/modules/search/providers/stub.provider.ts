import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type {
  ProviderSearchResult,
  ProviderSuggestResult,
  SearchInput,
  SearchProviderAdapter,
} from './search-provider.interface';

/**
 * Deterministic empty-result provider. Selected by SearchModule's
 * useFactory when SEARCH_PROVIDER=stub. Never opens a DB connection — useful
 * for offline dev / unit tests that don't want to mock $queryRaw.
 */
@Injectable()
export class StubSearchProvider implements SearchProviderAdapter {
  readonly name = 'stub' as const;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async search(input: SearchInput): Promise<ProviderSearchResult> {
    void input;
    this.logger.log({
      message: 'search.provider.stub.search_called',
      requestId: this.cls.getId(),
    });
    return { items: [], total: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async suggest(prefix: string, limit: number): Promise<ProviderSuggestResult> {
    void prefix;
    void limit;
    this.logger.log({
      message: 'search.provider.stub.suggest_called',
      requestId: this.cls.getId(),
    });
    return { suggestions: [] };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async reindex(): Promise<{ reindexed: number }> {
    this.logger.log({
      message: 'search.provider.stub.reindex_called',
      requestId: this.cls.getId(),
    });
    return { reindexed: 0 };
  }
}
