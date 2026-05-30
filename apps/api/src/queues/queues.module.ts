import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AppConfig } from '@/config/configuration';
import { MailModule } from '@/mail/mail.module';

import { EMAILS_QUEUE } from './emails/email-job.types';
import { EmailQueue } from './emails/email-queue.service';
import { EmailProcessor } from './emails/email.processor';

/** Parse a redis:// URL into the connection options BullMQ/ioredis expects. */
function parseRedisConnection(url: string): {
  host: string;
  port: number;
  password?: string;
  db?: number;
} {
  const parsed = new URL(url);
  const connection: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  } = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.password) connection.password = parsed.password;
  const db = parsed.pathname.replace(/^\//, '');
  if (db) connection.db = Number(db);
  return connection;
}

/**
 * Background-job infrastructure (Redis-backed BullMQ). Registers the shared
 * connection plus the `emails` queue, its processor, and a typed producer.
 * Exports BullModule + EmailQueue so other modules can enqueue jobs by importing
 * QueuesModule.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<AppConfig['REDIS_URL']>('REDIS_URL');
        if (!url) throw new Error('REDIS_URL is not configured');
        return { connection: parseRedisConnection(url) };
      },
    }),
    BullModule.registerQueue({
      name: EMAILS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
    MailModule,
  ],
  providers: [EmailProcessor, EmailQueue],
  exports: [BullModule, EmailQueue],
})
export class QueuesModule {}
