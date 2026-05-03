import { Injectable } from '@nestjs/common';
import type { User as PrismaUser, UserRole } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { UserEntity } from './entities/user.entity';

interface CreateUserData {
  email: string;
  passwordHash: string;
  role?: UserRole;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        ...(data.role !== undefined && { role: data.role }),
      },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PrismaUser): UserEntity {
    const e = new UserEntity();
    e.id = row.id;
    e.email = row.email;
    e.role = row.role;
    e.passwordHash = row.passwordHash;
    e.createdAt = row.createdAt;
    e.updatedAt = row.updatedAt;
    return e;
  }
}
