import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import type { PrismaService } from '@/prisma/prisma.service';

import { selectSearchProvider } from './search.module';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };
const mockPrisma = {} as unknown as PrismaService;

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => values[key]),
  } as unknown as ConfigService;
}

describe('selectSearchProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SEARCH_PROVIDER=postgres-fts (default) → PostgresFtsSearchProvider', () => {
    const provider = selectSearchProvider(
      makeConfig({ SEARCH_PROVIDER: 'postgres-fts' }),
      mockPrisma,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('postgres-fts');
  });

  it('SEARCH_PROVIDER=stub → StubSearchProvider + log stub_selected', () => {
    const provider = selectSearchProvider(
      makeConfig({ SEARCH_PROVIDER: 'stub' }),
      mockPrisma,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'search.module.stub_selected' }),
    );
  });
});
