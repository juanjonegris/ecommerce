import { BullModule } from '@nestjs/bullmq';
import type { LoggerService } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';
import { PrismaModule } from '@/prisma/prisma.module';
import { QueuesModule } from '@/queues/queues.module';

import { NEWSLETTER_QUEUE } from './newsletter-job.types';
import { NewsletterController } from './newsletter.controller';
import { NewsletterProcessor } from './newsletter.processor';
import { NewsletterQueue } from './newsletter.queue.service';
import { NewsletterRepository } from './newsletter.repository';
import { NewsletterService } from './newsletter.service';
import { KlaviyoProvider } from './providers/klaviyo.provider';
import { MailchimpProvider } from './providers/mailchimp.provider';
import {
  NEWSLETTER_PROVIDER,
  type NewsletterProviderAdapter,
} from './providers/newsletter-provider.interface';
import { StubNewsletterProvider } from './providers/stub.provider';

/**
 * Provider selection factory. Exported for unit testability — the module spec
 * exercises this directly rather than compiling a full TestingModule.
 *
 * - `NEWSLETTER_PROVIDER=mailchimp` + non-empty `MAILCHIMP_API_KEY` → Mailchimp
 * - `NEWSLETTER_PROVIDER=klaviyo`   + non-empty `KLAVIYO_API_KEY`   → Klaviyo
 * - anything else (including a chosen provider with an empty key)   → Stub
 */
export function selectNewsletterProvider(
  config: ConfigService,
  logger: LoggerService,
  cls: ClsService,
): NewsletterProviderAdapter {
  const which =
    config.get<AppConfig['NEWSLETTER_PROVIDER']>('NEWSLETTER_PROVIDER') ??
    'stub';
  const mailchimpKey =
    config.get<AppConfig['MAILCHIMP_API_KEY']>('MAILCHIMP_API_KEY') ?? '';
  const klaviyoKey =
    config.get<AppConfig['KLAVIYO_API_KEY']>('KLAVIYO_API_KEY') ?? '';
  if (which === 'mailchimp' && mailchimpKey) {
    return new MailchimpProvider(config, logger, cls);
  }
  if (which === 'klaviyo' && klaviyoKey) {
    return new KlaviyoProvider(config, logger, cls);
  }
  logger.log({ message: 'newsletter.module.stub_selected' });
  return new StubNewsletterProvider(logger, cls);
}

/**
 * Plan D2 — processor + queue producer + provider all live inside this module
 * to avoid a circular import with QueuesModule. `QueuesModule.forRootAsync`
 * (imported transitively here) registers the BullMQ connection token globally,
 * so a local `BullModule.registerQueue` works without re-registering the root.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    QueuesModule,
    BullModule.registerQueue({
      name: NEWSLETTER_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  controllers: [NewsletterController],
  providers: [
    NewsletterService,
    NewsletterRepository,
    NewsletterQueue,
    NewsletterProcessor,
    {
      provide: NEWSLETTER_PROVIDER,
      inject: [ConfigService, WINSTON_MODULE_NEST_PROVIDER, ClsService],
      useFactory: selectNewsletterProvider,
    },
  ],
  exports: [NewsletterService],
})
export class NewsletterModule {}
