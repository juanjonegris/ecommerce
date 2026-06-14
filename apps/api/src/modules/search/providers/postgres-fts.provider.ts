// FTS SQL lives HERE (not in a repository) — see search-module plan D3.
// The provider IS the repository for this module's queries; introducing a
// third tier would duplicate this responsibility.
import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/prisma/prisma.service';

import type {
  ProviderSearchResult,
  ProviderSuggestResult,
  SearchInput,
  SearchProviderAdapter,
} from './search-provider.interface';

interface SearchRow {
  id: string;
  score: number;
  snippet: string | null;
}

interface CountRow {
  count: bigint;
}

interface SuggestRow {
  name: string;
  slug: string;
}

const HEADLINE_OPTIONS =
  'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MinWords=4,MaxWords=18';

@Injectable()
export class PostgresFtsSearchProvider implements SearchProviderAdapter {
  readonly name = 'postgres-fts' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async search(input: SearchInput): Promise<ProviderSearchResult> {
    const requestId = this.cls.getId();
    const lang = this.ftsLanguage();
    const offset = (input.page - 1) * input.limit;
    const categoryParam: string | null = input.categoryId ?? null;

    // Both queries share the same WHERE so total stays consistent with data.
    const dataQuery = this.prisma.$queryRaw<SearchRow[]>`
      SELECT
        p.id,
        ts_rank(p."searchVector", websearch_to_tsquery(${lang}, ${input.query})) AS score,
        ts_headline(
          ${lang},
          coalesce(p."description", p."name"),
          websearch_to_tsquery(${lang}, ${input.query}),
          ${HEADLINE_OPTIONS}
        ) AS snippet
      FROM "Product" p
      WHERE p."isActive" = true
        AND (${categoryParam}::text IS NULL OR p."categoryId" = ${categoryParam})
        AND p."searchVector" @@ websearch_to_tsquery(${lang}, ${input.query})
      ORDER BY score DESC, p."createdAt" DESC
      LIMIT ${input.limit} OFFSET ${offset}
    `;

    const countQuery = this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Product" p
      WHERE p."isActive" = true
        AND (${categoryParam}::text IS NULL OR p."categoryId" = ${categoryParam})
        AND p."searchVector" @@ websearch_to_tsquery(${lang}, ${input.query})
    `;

    try {
      const [dataRows, countRows] = await this.prisma.$transaction([
        dataQuery,
        countQuery,
      ]);
      // Number() converts bigint → number; JSON serializers throw on raw
      // bigints, so the cast is required (the linter clears it because the
      // result of `?? 0n` is correctly inferred as bigint).
      const total = Number(countRows[0]?.count ?? 0n);
      this.logger.log({
        message: 'search.provider.postgres_fts.search_succeeded',
        requestId,
        total,
        returned: dataRows.length,
      });
      return {
        items: dataRows.map((r) => ({
          productId: r.id,
          score: r.score,
          snippet: r.snippet,
        })),
        total,
      };
    } catch (err) {
      this.logger.error(
        {
          message: 'search.provider.postgres_fts.search_failed',
          requestId,
          error: err instanceof Error ? err.message : String(err),
        },
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  async suggest(prefix: string, limit: number): Promise<ProviderSuggestResult> {
    const requestId = this.cls.getId();
    const rows = await this.prisma.$queryRaw<SuggestRow[]>`
      SELECT name, slug
      FROM "Product"
      WHERE "isActive" = true
        AND lower("name") LIKE lower(${prefix}) || '%'
      ORDER BY name ASC
      LIMIT ${limit}
    `;
    this.logger.log({
      message: 'search.provider.postgres_fts.suggest_succeeded',
      requestId,
      returned: rows.length,
    });
    return { suggestions: rows };
  }

  async reindex(): Promise<{ reindexed: number }> {
    // No writes — the generated tsvector column updates automatically on
    // every Product write. Endpoint exists so a future Meilisearch impl
    // drops in without a new endpoint. See plan D4.
    const requestId = this.cls.getId();
    const reindexed = await this.prisma.product.count({
      where: { isActive: true },
    });
    this.logger.log({
      message: 'search.provider.postgres_fts.reindex_audit',
      requestId,
      reindexed,
    });
    return { reindexed };
  }

  private ftsLanguage(): string {
    return (
      this.config.get<AppConfig['SEARCH_FTS_LANGUAGE']>(
        'SEARCH_FTS_LANGUAGE',
      ) ?? 'simple'
    );
  }
}
