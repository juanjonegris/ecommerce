import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { createMockUser } from '../../../test/factories/user.factory';

import { AuthController } from './auth.controller';
import type { AuthResult, AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UserEntity } from './entities/user.entity';

const mockService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  validateUser: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
};

function makeRes(): Response & { cookies: Record<string, unknown> } {
  const cookies: Record<string, unknown> = {};
  const res = {
    cookies,
    cookie: jest.fn((name: string, value: string, opts: unknown) => {
      cookies[name] = { value, opts };
      return res;
    }),
  } as unknown as Response & { cookies: Record<string, unknown> };
  return res;
}

function makeAuthResult(overrides: Partial<UserEntity> = {}): AuthResult {
  const user = createMockUser(overrides) as unknown as UserEntity;
  return {
    user,
    tokens: {
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresIn: 900,
    },
  };
}

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController(
      mockService as unknown as AuthService,
      mockConfig as unknown as ConfigService,
    );
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('delegates to service, sets refresh cookie, returns DTO', async () => {
      const dto: RegisterDto = {
        email: 'new@example.com',
        password: 'Password123!',
      };
      const result = makeAuthResult({ email: 'new@example.com' });
      mockService.register.mockResolvedValue(result);
      const res = makeRes();

      const response = await controller.register(dto, res);

      expect(mockService.register).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token-value',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/auth',
        }),
      );
      expect(response.accessToken).toBe('access-token-value');
      expect(response.expiresIn).toBe(900);
      expect(response.user.email).toBe('new@example.com');
      expect(response).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('delegates to service, sets refresh cookie, returns DTO', async () => {
      const dto: LoginDto = {
        email: 'jane@example.com',
        password: 'Password123!',
      };
      const result = makeAuthResult();
      mockService.login.mockResolvedValue(result);
      const res = makeRes();

      const response = await controller.login(dto, res);

      expect(mockService.login).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalled();
      expect(response.accessToken).toBe('access-token-value');
    });
  });

  describe('refresh', () => {
    it('reads refresh token from cookie header and rotates it', async () => {
      const result = makeAuthResult();
      mockService.refresh.mockResolvedValue(result);
      const res = makeRes();
      const req = {
        headers: { cookie: 'foo=bar; refresh_token=incoming-refresh; baz=qux' },
      } as unknown as Request;

      const response = await controller.refresh(req, res);

      expect(mockService.refresh).toHaveBeenCalledWith('incoming-refresh');
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token-value',
        expect.any(Object),
      );
      expect(response.accessToken).toBe('access-token-value');
    });

    it('throws UnauthorizedException when no cookie header is present', async () => {
      const req = { headers: {} } as Request;
      const res = makeRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockService.refresh).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when refresh_token cookie is missing', async () => {
      const req = {
        headers: { cookie: 'session=abc; other=def' },
      } as unknown as Request;
      const res = makeRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('me', () => {
    it('returns the current user as a UserResponseDto', () => {
      const user = createMockUser({
        id: 'u1',
        email: 'me@example.com',
      }) as unknown as UserEntity;

      const response = controller.me(user);

      expect(response.id).toBe('u1');
      expect(response.email).toBe('me@example.com');
      expect(response).not.toHaveProperty('passwordHash');
      expect(typeof response.createdAt).toBe('string');
    });
  });
});
