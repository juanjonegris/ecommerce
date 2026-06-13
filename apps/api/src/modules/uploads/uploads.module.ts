import { BullModule } from '@nestjs/bullmq';
import type { LoggerService, OnModuleInit } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import { ProductsModule } from '@/modules/products/products.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { QueuesModule } from '@/queues/queues.module';

import { S3Provider } from './providers/s3.provider';
import {
  STORAGE_PROVIDER,
  type StorageProviderAdapter,
} from './providers/storage-provider.interface';
import { StubStorageProvider } from './providers/stub.provider';
import { UPLOADS_QUEUE } from './uploads-job.types';
import { UploadsController } from './uploads.controller';
import { UploadsProcessor } from './uploads.processor';
import { UploadsQueue } from './uploads.queue.service';
import { UploadsRepository } from './uploads.repository';
import { UploadsService } from './uploads.service';

/**
 * Storage-provider selection factory. Exported for unit testability — the
 * module spec exercises this directly rather than compiling a TestingModule.
 *
 * - All three of S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET set → S3Provider
 * - any missing                                              → StubStorageProvider
 */
export function selectStorageProvider(
  config: ConfigService,
  logger: LoggerService,
  cls: ClsService,
): StorageProviderAdapter {
  const accessKey =
    config.get<AppConfig['S3_ACCESS_KEY']>('S3_ACCESS_KEY') ?? '';
  const secretKey =
    config.get<AppConfig['S3_SECRET_KEY']>('S3_SECRET_KEY') ?? '';
  const bucket = config.get<AppConfig['S3_BUCKET']>('S3_BUCKET') ?? '';
  if (accessKey && secretKey && bucket) {
    return new S3Provider(config, logger, cls);
  }
  logger.log({ message: 'uploads.module.stub_selected' });
  return new StubStorageProvider(logger, cls);
}

/**
 * The cleanup processor + queue live INSIDE this module (newsletter
 * precedent — avoids a circular import with QueuesModule). QueuesModule's
 * forRootAsync registers the BullMQ connection token globally, so the local
 * BullModule.registerQueue here works without re-registering the root.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ProductsModule,
    QueuesModule,
    BullModule.registerQueue({
      name: UPLOADS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    UploadsRepository,
    UploadsQueue,
    UploadsProcessor,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, WINSTON_MODULE_NEST_PROVIDER, ClsService],
      useFactory: selectStorageProvider,
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly queue: UploadsQueue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<AppConfig['NODE_ENV']>('NODE_ENV') === 'test') return;
    const provider = this.moduleRef.get<StorageProviderAdapter>(
      STORAGE_PROVIDER,
      { strict: false },
    );
    await provider.ensureBucket();
    await this.queue.scheduleCleanupRepeatable();
  }
}
