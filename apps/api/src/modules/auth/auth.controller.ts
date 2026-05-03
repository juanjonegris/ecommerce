import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { AppConfig } from '@/config/configuration';

import { AuthService, type AuthResult } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import type { UserEntity } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.service.register(dto);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return this.toAuthResponse(result);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive access + refresh tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.service.login(dto);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return this.toAuthResponse(result);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh-token cookie for new tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const result = await this.service.refresh(refreshToken);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return this.toAuthResponse(result);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  me(@CurrentUser() user: UserEntity): UserResponseDto {
    return UserResponseDto.from(user);
  }

  private toAuthResponse(result: AuthResult): AuthResponseDto {
    const dto = new AuthResponseDto();
    dto.accessToken = result.tokens.accessToken;
    dto.expiresIn = result.tokens.expiresIn;
    dto.user = UserResponseDto.from(result.user);
    return dto;
  }

  private setRefreshCookie(res: Response, token: string): void {
    const isProd =
      this.config.get<AppConfig['NODE_ENV']>('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }
}

function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME && rest.length > 0) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}
