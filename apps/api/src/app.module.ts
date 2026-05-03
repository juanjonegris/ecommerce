import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ClsModule } from '@/cls/cls.module';
import { configuration, validate } from '@/config/configuration';
import { LoggerModule } from '@/logger/logger.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { HealthModule } from '@/modules/health/health.module';
import { ProductsModule } from '@/modules/products/products.module';
import { PrismaModule } from '@/prisma/prisma.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      validate,
      // Single source of truth: monorepo root .env. cwd is apps/api when
      // running `pnpm --filter @repo/api dev`, so ../../.env points to root.
      envFilePath: ['.env', '../../.env'],
    }),
    ClsModule,
    LoggerModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    ProductsModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL') ?? 60_000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 10,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
