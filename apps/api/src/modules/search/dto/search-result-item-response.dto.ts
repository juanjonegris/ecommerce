import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProductResponseDto } from '@/modules/products/dto/product-response.dto';
import type { ProductEntity } from '@/modules/products/entities/product.entity';

export class SearchResultItemResponseDto {
  @ApiProperty({ type: ProductResponseDto })
  product!: ProductResponseDto;

  @ApiProperty({ example: 0.1234 })
  score!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Wireless <mark>headphones</mark> with noise cancelling',
  })
  snippet!: string | null;

  static from(item: {
    product: ProductEntity;
    score: number;
    snippet: string | null;
  }): SearchResultItemResponseDto {
    const dto = new SearchResultItemResponseDto();
    dto.product = ProductResponseDto.from(item.product);
    dto.score = item.score;
    dto.snippet = item.snippet;
    return dto;
  }
}
