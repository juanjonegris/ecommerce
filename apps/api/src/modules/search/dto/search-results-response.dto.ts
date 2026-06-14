import { ApiProperty } from '@nestjs/swagger';

import { SearchResultItemResponseDto } from './search-result-item-response.dto';

export class SearchResultsResponseDto {
  @ApiProperty({ type: [SearchResultItemResponseDto] })
  data!: SearchResultItemResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
