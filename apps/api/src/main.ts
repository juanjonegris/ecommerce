import type { LoggerService } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import type { AppConfig } from '@/config/configuration';

import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../package.json') as { version: string };

async function bootstrap(): Promise<void> {
  // rawBody is required for the payments webhook route to verify the Stripe
  // signature over the unparsed body. Every other route still receives parsed
  // JSON via the global ValidationPipe.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  const cls = app.get(ClsService);
  const config = app.get(ConfigService);

  app.useLogger(logger);
  app.use(helmet());
  app.enableCors({
    origin: config.get<AppConfig['CORS_ORIGINS']>('CORS_ORIGINS') ?? [],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(logger, cls));
  app.useGlobalInterceptors(new LoggingInterceptor(logger, cls));

  const swaggerDoc = new DocumentBuilder()
    .setTitle('White-Label E-Commerce API')
    .setDescription(
      'REST API for a white-label e-commerce platform supporting products, orders, cart, auth, and admin.',
    )
    .setVersion(pkg.version)
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerDoc),
  );

  const port = config.get<AppConfig['PORT']>('PORT') ?? 3001;
  await app.listen(port, () => {
    logger.log({
      message: 'api.bootstrap.start_succeeded',
      port,
    });
  });
}

void bootstrap();
