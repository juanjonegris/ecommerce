import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import type { PrismaService } from '@/prisma/prisma.service';

import { PostgresFtsSearchProvider } from './postgres-fts.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(values: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    SEARCH_FTS_LANGUAGE: 'simple',
    ...values,
  };
  return {
    get: jest.fn((key: string): unknown => defaults[key]),
  } as unknown as ConfigService;
}

interface PrismaMocks {
  prisma: PrismaService;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  productCount: jest.Mock;
  $executeRaw: jest.Mock;
}

function makePrisma(): PrismaMocks {
  const $queryRaw = jest.fn();
  const $executeRaw = jest.fn();
  const productCount = jest.fn();
  // $transaction passthrough for the array form — awaits each promise in order.
  const $transaction = jest
    .fn()
    .mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : Promise.resolve(arg),
    );
  const prisma = {
    $queryRaw,
    $executeRaw,
    $transaction,
    product: { count: productCount },
  } as unknown as PrismaService;
  return { prisma, $queryRaw, $transaction, productCount, $executeRaw };
}

describe('PostgresFtsSearchProvider', () => {
  let mocks: PrismaMocks;
  let provider: PostgresFtsSearchProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = makePrisma();
    provider = new PostgresFtsSearchProvider(
      mocks.prisma,
      makeConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
  });

  it('search runs data + count inside a $transaction and maps rows', async () => {
    mocks.$queryRaw
      .mockResolvedValueOnce([
        { id: 'p1', score: 0.5, snippet: '<mark>foo</mark>' },
        { id: 'p2', score: 0.3, snippet: null },
      ])
      .mockResolvedValueOnce([{ count: 2n }]);

    const result = await provider.search({
      query: 'foo',
      page: 1,
      limit: 20,
    });

    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([
      { productId: 'p1', score: 0.5, snippet: '<mark>foo</mark>' },
      { productId: 'p2', score: 0.3, snippet: null },
    ]);
    expect(result.total).toBe(2);
  });

  it('search with categoryId passes the value through', async () => {
    mocks.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    await provider.search({
      query: 'foo',
      page: 1,
      limit: 10,
      categoryId: 'cat-123',
    });
    // $queryRaw is a tagged-template function — the first call's args are
    // [TemplateStringsArray, ...boundValues]. slice(1) gives the bound values.
    const firstCall = mocks.$queryRaw.mock.calls[0] as unknown[] | undefined;
    const firstCallValues = firstCall?.slice(1) ?? [];
    expect(firstCallValues).toEqual(expect.arrayContaining(['cat-123']));
  });

  it('search without categoryId binds null', async () => {
    mocks.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    await provider.search({ query: 'foo', page: 1, limit: 10 });
    const firstCall = mocks.$queryRaw.mock.calls[0] as unknown[] | undefined;
    const firstCallValues = firstCall?.slice(1) ?? [];
    // Two slots in the SQL bind categoryParam (the conditional + the equality).
    const nullCount = firstCallValues.filter((v) => v === null).length;
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });

  it('search coerces bigint count to Number for JSON safety', async () => {
    mocks.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 9999999999n }]);
    const result = await provider.search({
      query: 'foo',
      page: 1,
      limit: 10,
    });
    expect(typeof result.total).toBe('number');
    expect(result.total).toBe(9999999999);
  });

  it('suggest binds the prefix and limit', async () => {
    mocks.$queryRaw.mockResolvedValueOnce([
      { name: 'Wireless Headphones', slug: 'wireless-headphones' },
    ]);
    const result = await provider.suggest('wir', 5);
    expect(result.suggestions).toHaveLength(1);
    const call = mocks.$queryRaw.mock.calls[0] as unknown[] | undefined;
    const callValues = call?.slice(1) ?? [];
    expect(callValues).toEqual(expect.arrayContaining(['wir', 5]));
  });

  it('reindex returns count of active products without writes', async () => {
    mocks.productCount.mockResolvedValueOnce(42);
    const result = await provider.reindex();
    expect(result).toEqual({ reindexed: 42 });
    expect(mocks.productCount).toHaveBeenCalledWith({
      where: { isActive: true },
    });
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'search.provider.postgres_fts.reindex_audit',
      }),
    );
  });
});
