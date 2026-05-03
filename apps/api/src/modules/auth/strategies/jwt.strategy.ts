import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '@/config/configuration';

import { AuthService } from '../auth.service';
import type { UserEntity } from '../entities/user.entity';
import type { JwtPayload } from '../jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = config.get<AppConfig['JWT_SECRET']>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<UserEntity> {
    const user = await this.authService.validateUser(payload);
    if (!user) throw new UnauthorizedException('Invalid token');
    return user;
  }
}
