import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { DiscountValidation, PaginatedResponse } from '@repo/types';

import type { CartIdentity } from '@/modules/cart/cart.service';
import { CartService } from '@/modules/cart/cart.service';

import { DiscountsRepository } from './discounts.repository';
import type { CreateDiscountDto } from './dto/create-discount.dto';
import type { UpdateDiscountDto } from './dto/update-discount.dto';
import type { DiscountEntity } from './entities/discount.entity';

@Injectable()
export class DiscountsService {
  constructor(
    private readonly repository: DiscountsRepository,
    private readonly cart: CartService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Controller-facing validation. Resolves the caller's cart, computes the
   * subtotal, then delegates to validateForSubtotal.
   */
  async validate(
    code: string,
    identity: CartIdentity,
  ): Promise<DiscountValidation> {
    const cart = await this.cart.getCart(identity);
    const subtotal = this.round2(
      cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    );
    return this.validateForSubtotal(code, subtotal);
  }

  /**
   * Cart-agnostic validator. OrdersService calls this from inside the order
   * create flow so we don't re-resolve the cart.
   */
  async validateForSubtotal(
    code: string,
    subtotal: number,
  ): Promise<DiscountValidation> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'discount.service.validate_started',
      requestId,
      code,
      subtotal,
    });

    if (subtotal <= 0) {
      throw new BadRequestException('Cart is empty');
    }

    const dc = await this.repository.findByCodeActive(code);
    if (!dc) {
      // Inactive is indistinguishable from missing — same 404, no info leak.
      throw new NotFoundException('Discount code not found');
    }

    if (dc.expiresAt !== null && dc.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Discount code expired');
    }

    let type: DiscountValidation['type'];
    let value: number;
    let amountApplied: number;
    if (dc.percentOff !== null) {
      type = 'PERCENT';
      value = dc.percentOff;
      amountApplied = this.round2((subtotal * dc.percentOff) / 100);
    } else if (dc.amountOff !== null) {
      type = 'AMOUNT';
      value = dc.amountOff;
      // Never discount more than the subtotal.
      amountApplied = Math.min(dc.amountOff, subtotal);
    } else {
      // Inconsistent row — neither field set. Shouldn't happen given
      // service-level XOR on create/update, but defensive.
      throw new BadRequestException('Discount code misconfigured');
    }

    const total = Math.max(0, this.round2(subtotal - amountApplied));
    const result: DiscountValidation = {
      code: dc.code,
      discountId: dc.id,
      type,
      value,
      amountApplied,
      subtotal,
      total,
    };

    this.logger.log({
      message: 'discount.service.validate_succeeded',
      requestId,
      discountId: dc.id,
      amountApplied,
      total,
    });
    return result;
  }

  /**
   * Inserts a redemption row inside the caller-provided transaction so order
   * creation + redemption stay atomic. Throws ConflictException on duplicate
   * (P2002 → repo returns false) so the order $transaction rolls back.
   */
  async redeem(
    discountId: string,
    orderId: string,
    amountApplied: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const requestId = this.cls.getId();
    const inserted = await this.repository.redeem(
      discountId,
      orderId,
      amountApplied,
      tx,
    );
    if (!inserted) {
      this.logger.warn({
        message: 'discount.service.redeem_duplicate_skipped',
        requestId,
        discountId,
        orderId,
      });
      throw new ConflictException('Discount already redeemed for this order');
    }
    this.logger.log({
      message: 'discount.service.redeem_succeeded',
      requestId,
      discountId,
      orderId,
      amountApplied,
    });
  }

  async create(dto: CreateDiscountDto): Promise<DiscountEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'discount.service.create_started',
      requestId,
      code: dto.code,
    });

    this.assertXor(dto.percentOff, dto.amountOff);

    let expiresAt: Date | null = null;
    if (dto.expiresAt !== undefined) {
      const parsed = new Date(dto.expiresAt);
      if (parsed.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      expiresAt = parsed;
    }

    try {
      const discount = await this.repository.create({
        code: dto.code.toUpperCase().trim(),
        percentOff: dto.percentOff ?? null,
        amountOff: dto.amountOff ?? null,
        expiresAt,
      });
      this.logger.log({
        message: 'discount.service.create_succeeded',
        requestId,
        discountId: discount.id,
      });
      return discount;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Discount code "${dto.code}" already exists`,
        );
      }
      throw err;
    }
  }

  async findAll(pagination: {
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<DiscountEntity>> {
    return this.repository.findAll(pagination);
  }

  async findById(id: string): Promise<DiscountEntity> {
    const discount = await this.repository.findById(id);
    if (!discount) {
      throw new NotFoundException(`Discount "${id}" not found`);
    }
    return discount;
  }

  async update(id: string, dto: UpdateDiscountDto): Promise<DiscountEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'discount.service.update_started',
      requestId,
      discountId: id,
    });

    const current = await this.findById(id);

    // Both fields explicitly in the DTO is always an XOR violation. Either
    // field on its own means "switch to this type" — we'll null the other
    // side below and the row stays valid. If neither is in the DTO, the
    // existing row stands (which is already valid by construction).
    if (dto.percentOff !== undefined && dto.amountOff !== undefined) {
      throw new BadRequestException(
        'Exactly one of percentOff or amountOff must be set',
      );
    }

    const patch: Parameters<DiscountsRepository['update']>[1] = {};
    if (dto.code !== undefined) patch.code = dto.code.toUpperCase().trim();
    if (dto.expiresAt !== undefined) {
      const parsed = new Date(dto.expiresAt);
      if (parsed.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      patch.expiresAt = parsed;
    }

    // If one side of the XOR is being set, null the other to keep the
    // exactly-one-of invariant on the row.
    if (dto.percentOff !== undefined) {
      patch.percentOff = dto.percentOff;
      if (current.amountOff !== null) patch.amountOff = null;
    }
    if (dto.amountOff !== undefined) {
      patch.amountOff = dto.amountOff;
      if (current.percentOff !== null) patch.percentOff = null;
    }

    const updated = await this.repository.update(id, patch);
    this.logger.log({
      message: 'discount.service.update_succeeded',
      requestId,
      discountId: id,
    });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const requestId = this.cls.getId();
    await this.findById(id); // 404 if missing
    await this.repository.softDelete(id);
    this.logger.log({
      message: 'discount.service.remove_succeeded',
      requestId,
      discountId: id,
    });
  }

  private assertXor(
    percentOff: number | undefined,
    amountOff: number | undefined,
  ): void {
    const hasPercent = percentOff !== undefined;
    const hasAmount = amountOff !== undefined;
    if (hasPercent === hasAmount) {
      throw new BadRequestException(
        'Exactly one of percentOff or amountOff must be set',
      );
    }
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
