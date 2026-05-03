import { z } from 'zod';

export interface DiscountCode {
  id: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Application-level invariant: exactly one of percentOff / amountOff is set
// (Postgres CHECK constraints can't be expressed in Prisma schema yet — see schema.prisma).
export const DiscountCodeSchema = z
  .object({
    id: z.string(),
    code: z.string().min(1).max(64),
    percentOff: z.number().int().min(0).max(100).nullable(),
    amountOff: z.number().nonnegative().nullable(),
    expiresAt: z.date().nullable(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((d) => (d.percentOff === null) !== (d.amountOff === null), {
    message: 'exactly one of percentOff or amountOff must be set',
  });
