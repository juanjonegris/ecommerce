import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { AppConfig } from '@/config/configuration';
import { PrismaModule } from '@/prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<AppConfig['JWT_SECRET']>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is not configured');
        const expiresIn =
          config.get<AppConfig['JWT_EXPIRES_IN']>('JWT_EXPIRES_IN') ?? '15m';
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as unknown as number,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
