import { ApiProperty } from '@nestjs/swagger';

import type { SearchSuggestion } from '@repo/types';

export class SearchSuggestionResponseDto implements SearchSuggestion {
  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug!: string;

  static from(entity: SearchSuggestion): SearchSuggestionResponseDto {
    const dto = new SearchSuggestionResponseDto();
    dto.name = entity.name;
    dto.slug = entity.slug;
    return dto;
  }
}
