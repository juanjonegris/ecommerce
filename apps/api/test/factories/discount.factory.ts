import type { DiscountValidation } from '@repo/types';

import { DiscountEntity } from '@/modules/discounts/entities/discount.entity';

let counter = 0;

export function createMockDiscount(
  overrides: Partial<DiscountEntity> = {},
): DiscountEntity {
  const n = ++counter;
  const e = new DiscountEntity();
  e.id = `disc-${String(n)}`;
  e.code = `CODE${String(n)}`;
  e.percentOff = 10;
  e.amountOff = null;
  e.expiresAt = null;
  e.isActive = true;
  e.createdAt = new Date('2026-01-01');
  e.updatedAt = new Date('2026-01-01');
  return Object.assign(e, overrides);
}

export function createMockDiscountValidation(
  overrides: Partial<DiscountValidation> = {},
): DiscountValidation {
  return {
    code: 'CODE1',
    discountId: 'disc-1',
    type: 'PERCENT',
    value: 10,
    amountApplied: 5,
    subtotal: 50,
    total: 45,
    ...overrides,
  };
}
