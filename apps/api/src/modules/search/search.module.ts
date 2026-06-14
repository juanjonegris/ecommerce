import type { LoggerService } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { ProductsModule } from '@/modules/products/products.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { PrismaService } from '@/prisma/prisma.service';

import { PostgresFtsSearchProvider } from './providers/postgres-fts.provider';
import {
  SEARCH_PROVIDER,
  type SearchProviderAdapter,
} from './providers/search-provider.interface';
import { StubSearchProvider } from './providers/stub.provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Provider selection factory. Exported for unit testability — the module
 * spec exercises this directly rather than compiling a full TestingModule.
 *
 * - `SEARCH_PROVIDER=postgres-fts` (default) → PostgresFtsSearchProvider
 * - `SEARCH_PROVIDER=stub`                   → StubSearchProvider
 */
export function selectSearchProvider(
  config: ConfigService,
  prisma: PrismaService,
  logger: LoggerService,
  cls: ClsService,
): SearchProviderAdapter {
  const which =
    config.get<AppConfig['SEARCH_PROVIDER']>('SEARCH_PROVIDER') ??
    'postgres-fts';
  if (which === 'stub') {
    logger.log({ message: 'search.module.stub_selected' });
    return new StubSearchProvider(logger, cls);
  }
  return new PostgresFtsSearchProvider(prisma, config, logger, cls);
}

@Module({
  imports: [PrismaModule, ConfigModule, ProductsModule, CategoriesModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    {
      provide: SEARCH_PROVIDER,
      inject: [
        ConfigService,
        PrismaService,
        WINSTON_MODULE_NEST_PROVIDER,
        ClsService,
      ],
      useFactory: selectSearchProvider,
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
