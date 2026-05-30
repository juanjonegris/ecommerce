import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, LoggerService } from '@nestjs/common';
import type { Job } from 'bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { MAIL_SERVICE } from '@/mail/mail.service';
import type { MailService, SendMailOptions } from '@/mail/mail.service';

import {
  EMAILS_QUEUE,
  type EmailJobData,
  type OrderConfirmationJob,
  type PasswordResetJob,
  type WelcomeJob,
} from './email-job.types';

/**
 * Consumes the `emails` queue and renders each job into a MailService send.
 * Never calls a provider (Resend/SES) directly — it delegates to MailService.
 * Throwing on failure lets BullMQ apply the queue's retry/backoff policy.
 */
@Processor(EMAILS_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const requestId = job.data.requestId ?? job.id ?? 'unknown';

    this.logger.log({
      message: 'email.processor.process_started',
      requestId,
      jobId: job.id,
      jobName: job.name,
    });

    try {
      const mail = this.buildMail(job);
      await this.mail.send({ ...mail, requestId });

      this.logger.log({
        message: 'email.processor.process_succeeded',
        requestId,
        jobId: job.id,
        jobName: job.name,
      });
    } catch (err) {
      this.logger.error(
        {
          message: 'email.processor.process_failed',
          requestId,
          jobId: job.id,
          jobName: job.name,
          error: err instanceof Error ? err.message : String(err),
        },
        err instanceof Error ? err.stack : undefined,
      );
      // Rethrow so BullMQ records the attempt and applies backoff/retry.
      throw err;
    }
  }

  private buildMail(
    job: Job<EmailJobData>,
  ): Omit<SendMailOptions, 'requestId'> {
    switch (job.name) {
      case 'order-confirmation': {
        const data = job.data as OrderConfirmationJob;
        return {
          to: data.to,
          subject: `Your order ${data.orderId} is confirmed`,
          html: `<p>Thanks for your order <strong>${data.orderId}</strong>.</p><p>Total: ${data.total.toFixed(2)}</p>`,
        };
      }
      case 'password-reset': {
        const data = job.data as PasswordResetJob;
        return {
          to: data.to,
          subject: 'Reset your password',
          html: `<p>Reset your password using the link below:</p><p><a href="${data.resetUrl}">Reset password</a></p>`,
        };
      }
      case 'welcome': {
        const data = job.data as WelcomeJob;
        const greeting = data.name ? `Hi ${data.name}` : 'Welcome';
        return {
          to: data.to,
          subject: 'Welcome to the store',
          html: `<p>${greeting}! Thanks for creating an account.</p>`,
        };
      }
      default:
        throw new Error(`Unknown email job: ${job.name}`);
    }
  }
}
