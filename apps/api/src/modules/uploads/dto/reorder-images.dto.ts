import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderItemDto {
  @ApiProperty({ example: 'cm0imageabc' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsInt()
  @Min(0)
  order!: number;
}

export class ReorderImagesDto {
  @ApiProperty({ example: 'cm0productabc' })
  @IsString()
  productId!: string;

  @ApiProperty({ type: [ReorderItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items!: ReorderItemDto[];
}
