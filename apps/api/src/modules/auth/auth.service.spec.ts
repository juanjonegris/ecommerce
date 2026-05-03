import {
  ConflictException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { ClsService } from 'nestjs-cls';

import { createMockUser } from '../../../test/factories/user.factory';

import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UserEntity } from './entities/user.entity';

const mockRepo: jest.Mocked<
  Pick<AuthRepository, 'findById' | 'findByEmail' | 'create'>
> = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'JWT_EXPIRES_IN') return '15m';
    if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
    if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
    return undefined;
  }),
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      mockRepo as unknown as AuthRepository,
      mockJwt as unknown as JwtService,
      mockConfig as unknown as ConfigService,
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
    mockJwt.signAsync.mockImplementation(
      (_payload, opts?: { secret?: string }) =>
        Promise.resolve(
          opts?.secret ? 'refresh.jwt.token' : 'access.jwt.token',
        ),
    );
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'New@Example.com',
      password: 'Password123!',
    };

    it('hashes password, creates CUSTOMER user, and issues tokens', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      const created = createMockUser({
        email: 'new@example.com',
        role: 'CUSTOMER',
      });
      mockRepo.create.mockResolvedValue(created as unknown as UserEntity);

      const result = await service.register(dto);

      expect(mockRepo.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      const createArg = mockRepo.create.mock.calls[0]?.[0];
      expect(createArg?.email).toBe('new@example.com');
      expect(createArg?.role).toBe('CUSTOMER');
      // password should be hashed (bcrypt format)
      expect(createArg?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(createArg?.passwordHash).not.toBe(dto.password);

      expect(result.tokens.accessToken).toBe('access.jwt.token');
      expect(result.tokens.refreshToken).toBe('refresh.jwt.token');
      expect(result.tokens.expiresIn).toBe(15 * 60);
      expect(result.user).toBe(created);
    });

    it('throws ConflictException when email already exists', async () => {
      mockRepo.findByEmail.mockResolvedValue(
        createMockUser() as unknown as UserEntity,
      );

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'Jane@Example.com',
      password: 'Password123!',
    };

    it('issues tokens when credentials are valid', async () => {
      const passwordHash = await bcrypt.hash(dto.password, 4);
      const user = createMockUser({
        email: 'jane@example.com',
        passwordHash,
      });
      mockRepo.findByEmail.mockResolvedValue(user as unknown as UserEntity);

      const result = await service.login(dto);

      expect(mockRepo.findByEmail).toHaveBeenCalledWith('jane@example.com');
      expect(result.tokens.accessToken).toBe('access.jwt.token');
      expect(result.tokens.refreshToken).toBe('refresh.jwt.token');
    });

    it('throws UnauthorizedException when user is not found', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      const passwordHash = await bcrypt.hash('different-password', 4);
      const user = createMockUser({ passwordHash });
      mockRepo.findByEmail.mockResolvedValue(user as unknown as UserEntity);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('issues new tokens for a valid refresh token', async () => {
      const user = createMockUser({ id: 'u1' });
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u1', type: 'refresh' });
      mockRepo.findById.mockResolvedValue(user as unknown as UserEntity);

      const result = await service.refresh('valid.refresh.token');

      expect(mockJwt.verifyAsync).toHaveBeenCalledWith('valid.refresh.token', {
        secret: 'test-refresh-secret',
      });
      expect(result.tokens.accessToken).toBe('access.jwt.token');
      expect(result.user).toBe(user);
    });

    it('throws UnauthorizedException when verify fails', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(service.refresh('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when payload type is not "refresh"', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u1', type: 'access' });

      await expect(service.refresh('access.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'gone', type: 'refresh' });
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateUser', () => {
    it('returns the user when found by JWT subject', async () => {
      const user = createMockUser({ id: 'u1' });
      mockRepo.findById.mockResolvedValue(user as unknown as UserEntity);

      const result = await service.validateUser({
        sub: 'u1',
        email: 'x@x.com',
        role: 'CUSTOMER',
      });

      expect(result).toBe(user);
    });

    it('returns null when user no longer exists', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const result = await service.validateUser({
        sub: 'gone',
        email: 'x@x.com',
        role: 'CUSTOMER',
      });

      expect(result).toBeNull();
    });
  });
});
