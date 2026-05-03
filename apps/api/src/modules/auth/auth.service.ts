import {
  ConflictException,
  Inject,
  Injectable,
  LoggerService,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';

import { AuthRepository } from './auth.repository';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UserEntity } from './entities/user.entity';
import type { JwtPayload, RefreshTokenPayload } from './jwt-payload';

const BCRYPT_ROUNDS = 12;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: UserEntity;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const requestId = this.cls.getId();
    const email = dto.email.toLowerCase();

    this.logger.log({
      message: 'auth.service.register_started',
      requestId,
      email,
    });

    const existing = await this.repository.findByEmail(email);
    if (existing) {
      throw new ConflictException(`Email "${email}" is already registered`);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.repository.create({
      email,
      passwordHash,
      role: UserRole.CUSTOMER,
    });

    const tokens = await this.issueTokens(user);

    this.logger.log({
      message: 'auth.service.register_succeeded',
      requestId,
      userId: user.id,
    });

    return { user, tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const requestId = this.cls.getId();
    const email = dto.email.toLowerCase();

    this.logger.log({
      message: 'auth.service.login_started',
      requestId,
      email,
    });

    const user = await this.repository.findByEmail(email);
    if (!user) {
      this.logger.warn({
        message: 'auth.service.login_failed',
        requestId,
        email,
        reason: 'user_not_found',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      this.logger.warn({
        message: 'auth.service.login_failed',
        requestId,
        userId: user.id,
        reason: 'password_mismatch',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);

    this.logger.log({
      message: 'auth.service.login_succeeded',
      requestId,
      userId: user.id,
    });

    return { user, tokens };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const requestId = this.cls.getId();

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        refreshToken,
        { secret: this.refreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.repository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user);

    this.logger.log({
      message: 'auth.service.refresh_succeeded',
      requestId,
      userId: user.id,
    });

    return { user, tokens };
  }

  async validateUser(payload: JwtPayload): Promise<UserEntity | null> {
    return this.repository.findById(payload.sub);
  }

  private async issueTokens(user: UserEntity): Promise<IssuedTokens> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      type: 'refresh',
    };

    const accessExpiresIn =
      this.config.get<AppConfig['JWT_EXPIRES_IN']>('JWT_EXPIRES_IN') ?? '1d';
    const refreshExpiresIn =
      this.config.get<AppConfig['JWT_REFRESH_EXPIRES_IN']>(
        'JWT_REFRESH_EXPIRES_IN',
      ) ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: accessExpiresIn as unknown as number,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret(),
        expiresIn: refreshExpiresIn as unknown as number,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: parseExpiresInToSeconds(accessExpiresIn),
    };
  }

  private refreshSecret(): string {
    const secret =
      this.config.get<AppConfig['JWT_REFRESH_SECRET']>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');
    return secret;
  }
}

function parseExpiresInToSeconds(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = /^(\d+)\s*([smhd])?$/.exec(value);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return amount * (multipliers[unit] ?? 1);
}
