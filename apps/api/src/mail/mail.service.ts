import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import type { AppConfig } from '@/config/configuration';

/** Provider-agnostic email payload. Any MailService implementation accepts this shape. */
export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Propagated from the enqueuing request so worker logs stay correlated. */
  requestId?: string;
}

/**
 * Mail abstraction. Swap providers (SendGrid, SES, …) by binding a different
 * implementation to MAIL_SERVICE in MailModule — no caller changes required.
 */
export interface MailService {
  send(options: SendMailOptions): Promise<void>;
}

/** DI token for the MailService interface (interfaces have no runtime token). */
export const MAIL_SERVICE = 'MAIL_SERVICE';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend-backed MailService. Talks to the Resend REST API directly via `fetch`
 * (no SDK dependency). Dev-safe: when RESEND_API_KEY is empty it logs the
 * payload instead of sending, so local runs never hit the network.
 */
@Injectable()
export class ResendMailService implements MailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(
    config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.apiKey =
      config.get<AppConfig['RESEND_API_KEY']>('RESEND_API_KEY') ?? '';
    this.from =
      config.get<AppConfig['MAIL_FROM']>('MAIL_FROM') ?? 'no-reply@localhost';
  }

  async send(options: SendMailOptions): Promise<void> {
    if (!this.apiKey) {
      // Dev stub: no provider configured — log the payload instead of sending.
      this.logger.log({
        message: 'mail.service.send_skipped',
        requestId: options.requestId,
        to: options.to,
        subject: options.subject,
        reason: 'RESEND_API_KEY not configured',
      });
      return;
    }

    this.logger.log({
      message: 'mail.service.send_started',
      requestId: options.requestId,
      to: options.to,
      subject: options.subject,
    });

    const payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text?: string;
    } = {
      from: this.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };
    if (options.text !== undefined) payload.text = options.text;

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend API error ${String(res.status)}: ${detail}`);
    }

    this.logger.log({
      message: 'mail.service.send_succeeded',
      requestId: options.requestId,
      to: options.to,
      subject: options.subject,
    });
  }
}
