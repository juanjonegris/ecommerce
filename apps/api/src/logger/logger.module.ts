import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule, utilities as nestWinstonUtils } from 'nest-winston';
import * as winston from 'winston';

import type { AppConfig } from '@/config/configuration';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): winston.LoggerOptions => {
        const env =
          config.get<AppConfig['NODE_ENV']>('NODE_ENV') ?? 'development';
        const isProd = env === 'production';

        return {
          defaultMeta: { env },
          transports: [
            new winston.transports.Console({
              format: isProd
                ? winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.errors({ stack: true }),
                    winston.format.json(),
                  )
                : winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.errors({ stack: true }),
                    nestWinstonUtils.format.nestLike('API', {
                      prettyPrint: true,
                      colors: true,
                    }),
                  ),
            }),
          ],
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
