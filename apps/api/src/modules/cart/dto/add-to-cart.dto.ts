import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ example: 'clabcdef0000000000000000' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}
