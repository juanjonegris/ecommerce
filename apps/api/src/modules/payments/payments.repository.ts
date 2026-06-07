import { Injectable } from '@nestjs/common';
import type {
  Payment as PrismaPayment,
  PaymentProvider as PrismaPaymentProvider,
  PaymentStatus as PrismaPaymentStatus,
} from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { PaymentEntity } from './entities/payment.entity';

interface CreateData {
  orderId: string;
  provider: PrismaPaymentProvider;
  providerPaymentId: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateData): Promise<PaymentEntity> {
    const row = await this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
        amount: data.amount,
        currency: data.currency,
        clientSecret: data.clientSecret,
      },
    });
    return this.toEntity(row);
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByProviderPaymentId(
    provider: PrismaPaymentProvider,
    providerPaymentId: string,
  ): Promise<PaymentEntity | null> {
    const row = await this.prisma.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId } },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByOrder(orderId: string): Promise<PaymentEntity[]> {
    const rows = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async existsSucceededForOrder(orderId: string): Promise<boolean> {
    const row = await this.prisma.payment.findFirst({
      where: { orderId, status: 'SUCCEEDED' },
      select: { id: true },
    });
    return row !== null;
  }

  async updateStatus(
    id: string,
    status: PrismaPaymentStatus,
    failureReason?: string | null,
  ): Promise<PaymentEntity> {
    const row = await this.prisma.payment.update({
      where: { id },
      data: {
        status,
        ...(failureReason !== undefined ? { failureReason } : {}),
      },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PrismaPayment): PaymentEntity {
    const e = new PaymentEntity();
    e.id = row.id;
    e.orderId = row.orderId;
    e.provider = row.provider;
    e.providerPaymentId = row.providerPaymentId;
    e.status = row.status;
    e.amount = Number(row.amount);
    e.currency = row.currency;
    e.clientSecret = row.clientSecret;
    e.failureReason = row.failureReason;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
