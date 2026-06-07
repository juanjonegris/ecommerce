import type { DiscountCode } from '@repo/types';

export class DiscountEntity implements DiscountCode {
  id!: string;
  code!: string;
  percentOff!: number | null;
  amountOff!: number | null;
  expiresAt!: Date | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
