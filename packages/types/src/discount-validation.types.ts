import { z } from 'zod';

export type DiscountType = 'PERCENT' | 'AMOUNT';

/**
 * Result of validating a discount code against a cart subtotal. Returned by
 * POST /discounts/validate and computed internally by OrdersService during
 * checkout. `amountApplied` is the resolved discount in major units; `total`
 * is `subtotal - amountApplied` clamped to >= 0.
 */
export interface DiscountValidation {
  code: string;
  discountId: string;
  type: DiscountType;
  value: number; // percentOff (1-100) or amountOff (major units)
  amountApplied: number;
  subtotal: number;
  total: number;
}

export const DiscountValidationSchema = z.object({
  code: z.string(),
  discountId: z.string(),
  type: z.enum(['PERCENT', 'AMOUNT']),
  value: z.number().nonnegative(),
  amountApplied: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
