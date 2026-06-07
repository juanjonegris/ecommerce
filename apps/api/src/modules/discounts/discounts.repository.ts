import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DiscountCode as PrismaDiscountCode } from '@prisma/client';

import type { PaginatedResponse } from '@repo/types';

import { PrismaService } from '@/prisma/prisma.service';

import { DiscountEntity } from './entities/discount.entity';

interface CreateData {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  expiresAt: Date | null;
}

interface UpdateData {
  code?: string;
  percentOff?: number | null;
  amountOff?: number | null;
  expiresAt?: Date | null;
}

@Injectable()
export class DiscountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateData): Promise<DiscountEntity> {
    const row = await this.prisma.discountCode.create({
      data: {
        code: data.code,
        percentOff: data.percentOff,
        amountOff: data.amountOff,
        expiresAt: data.expiresAt,
      },
    });
    return this.toEntity(row);
  }

  async findAll(pagination: {
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<DiscountEntity>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.discountCode.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.discountCode.count(),
    ]);

    return { data: rows.map((r) => this.toEntity(r)), total, page, limit };
  }

  async findById(id: string): Promise<DiscountEntity | null> {
    const row = await this.prisma.discountCode.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  /**
   * Canonical lookup used by validate / order checkout. Filters out inactive
   * codes so the service layer cannot distinguish "missing" from "disabled" —
   * returning the same NotFoundException for both prevents code enumeration.
   */
  async findByCodeActive(code: string): Promise<DiscountEntity | null> {
    const row = await this.prisma.discountCode.findFirst({
      where: { code: code.toUpperCase().trim(), isActive: true },
    });
    return row ? this.toEntity(row) : null;
  }

  async update(id: string, data: UpdateData): Promise<DiscountEntity> {
    const row = await this.prisma.discountCode.update({ where: { id }, data });
    return this.toEntity(row);
  }

  async softDelete(id: string): Promise<DiscountEntity> {
    const row = await this.prisma.discountCode.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toEntity(row);
  }

  /**
   * Inserts a DiscountRedemption row. The `tx` parameter lets OrdersService
   * include this insert in its existing order-create $transaction so a P2002
   * (already redeemed) rolls back the order. Mirrors
   * `webhook-events.repository.recordEvent` for the idempotency primitive.
   *
   * @returns true on insert, false when the (discountCodeId, orderId) pair
   *   already exists (P2002).
   */
  async redeem(
    discountCodeId: string,
    orderId: string,
    amountApplied: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    try {
      await client.discountRedemption.create({
        data: { discountCodeId, orderId, amountApplied },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }

  private toEntity(row: PrismaDiscountCode): DiscountEntity {
    const e = new DiscountEntity();
    e.id = row.id;
    e.code = row.code;
    e.percentOff = row.percentOff;
    e.amountOff = row.amountOff === null ? null : Number(row.amountOff);
    e.expiresAt = row.expiresAt;
    e.isActive = row.isActive;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
