import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateDiscountDto {
  @ApiProperty({ example: 'SUMMER10', maxLength: 64 })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code!: string;
}
