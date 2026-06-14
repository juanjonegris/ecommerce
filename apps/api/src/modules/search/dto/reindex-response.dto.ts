import { ApiProperty } from '@nestjs/swagger';

export class ReindexResponseDto {
  @ApiProperty({ enum: ['postgres-fts', 'stub'], example: 'postgres-fts' })
  provider!: 'postgres-fts' | 'stub';

  @ApiProperty({ example: 42 })
  reindexed!: number;
}
