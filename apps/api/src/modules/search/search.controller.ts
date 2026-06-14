import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { ReindexResponseDto } from './dto/reindex-response.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultItemResponseDto } from './dto/search-result-item-response.dto';
import { SearchResultsResponseDto } from './dto/search-results-response.dto';
import { SearchSuggestionResponseDto } from './dto/search-suggestion-response.dto';
import { SuggestQueryDto } from './dto/suggest-query.dto';
import { SearchService } from './search.service';

const PUBLIC_SEARCH_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
const PUBLIC_SUGGEST_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @Throttle(PUBLIC_SEARCH_THROTTLE)
  @ApiOperation({
    summary: 'Search products (public, paginated, scored, with snippets)',
  })
  @ApiResponse({ status: 200, type: SearchResultsResponseDto })
  async search(
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultsResponseDto> {
    const result = await this.service.search({
      query: query.q,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      ...(query.categoryId !== undefined
        ? { categoryId: query.categoryId }
        : {}),
    });
    return {
      total: result.total,
      page: result.page,
      limit: result.limit,
      data: result.data.map((item) => SearchResultItemResponseDto.from(item)),
    };
  }

  @Get('suggest')
  @Throttle(PUBLIC_SUGGEST_THROTTLE)
  @ApiOperation({
    summary: 'Prefix-match product names (public, autocomplete)',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggestions array (capped at 10 server-side)',
  })
  async suggest(
    @Query() query: SuggestQueryDto,
  ): Promise<{ suggestions: SearchSuggestionResponseDto[] }> {
    const result = await this.service.suggest(query.q, query.limit);
    return {
      suggestions: result.suggestions.map((s) =>
        SearchSuggestionResponseDto.from(s),
      ),
    };
  }

  @Post('reindex')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reindex products (admin only — audit hook; postgres-fts is a no-op)',
  })
  @ApiResponse({ status: 200, type: ReindexResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async reindex(): Promise<ReindexResponseDto> {
    return this.service.reindex();
  }
}
