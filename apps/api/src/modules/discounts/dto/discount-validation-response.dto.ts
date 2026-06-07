import { ApiProperty } from '@nestjs/swagger';

import type { DiscountType, DiscountValidation } from '@repo/types';

export class DiscountValidationResponseDto implements DiscountValidation {
  @ApiProperty({ example: 'SUMMER10' })
  code!: string;

  @ApiProperty({ example: 'clabcdef0000000000000000' })
  discountId!: string;

  @ApiProperty({ enum: ['PERCENT', 'AMOUNT'], example: 'PERCENT' })
  type!: DiscountType;

  @ApiProperty({ example: 10 })
  value!: number;

  @ApiProperty({ example: 5.0 })
  amountApplied!: number;

  @ApiProperty({ example: 50.0 })
  subtotal!: number;

  @ApiProperty({ example: 45.0 })
  total!: number;

  static from(v: DiscountValidation): DiscountValidationResponseDto {
    const dto = new DiscountValidationResponseDto();
    dto.code = v.code;
    dto.discountId = v.discountId;
    dto.type = v.type;
    dto.value = v.value;
    dto.amountApplied = v.amountApplied;
    dto.subtotal = v.subtotal;
    dto.total = v.total;
    return dto;
  }
}
