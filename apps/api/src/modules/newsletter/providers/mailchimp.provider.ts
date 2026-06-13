import { createHash, timingSafeEqual } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';

import type {
  NewsletterProviderAdapter,
  UpsertSubscriberInput,
  UpsertSubscriberResult,
  VerifiedNewsletterWebhook,
} from './newsletter-provider.interface';

/**
 * Real Mailchimp-backed provider. Selected by NewsletterModule's useFactory
 * when NEWSLETTER_PROVIDER='mailchimp' AND MAILCHIMP_API_KEY is non-empty.
 *
 * Auth: HTTP Basic with `anystring:apikey`. Datacenter is the suffix of the
 * API key after the last dash (e.g. `xxxx-us21` → `us21`). Webhook
 * verification: shared secret in `?s=` query string, compared constant-time.
 */
@Injectable()
export class MailchimpProvider implements NewsletterProviderAdapter {
  readonly name = 'mailchimp' as const;

  private readonly apiKey: string;
  private readonly audienceId: string;
  private readonly webhookSecret: string;
  private readonly datacenter: string;

  constructor(
    config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.apiKey =
      config.get<AppConfig['MAILCHIMP_API_KEY']>('MAILCHIMP_API_KEY') ?? '';
    this.audienceId =
      config.get<AppConfig['MAILCHIMP_AUDIENCE_ID']>('MAILCHIMP_AUDIENCE_ID') ??
      '';
    this.webhookSecret =
      config.get<AppConfig['MAILCHIMP_WEBHOOK_SECRET']>(
        'MAILCHIMP_WEBHOOK_SECRET',
      ) ?? '';
    if (!this.apiKey) {
      // Unreachable in normal boot — the module factory binds the stub when
      // the key is empty. Throw if forced so the contradiction is loud.
      throw new Error('MailchimpProvider requires MAILCHIMP_API_KEY');
    }
    const dcSegments = this.apiKey.split('-');
    const dc = dcSegments[dcSegments.length - 1];
    this.datacenter = dc ?? 'us1';
  }

  async upsertSubscriber(
    input: UpsertSubscriberInput,
  ): Promise<UpsertSubscriberResult> {
    const requestId = this.cls.getId();
    const email = input.email.toLowerCase();
    const subscriberHash = md5(email);
    const url = `https://${this.datacenter}.api.mailchimp.com/3.0/lists/${this.audienceId}/members/${subscriberHash}`;

    const body = {
      email_address: email,
      status_if_new: input.doubleOptIn ? 'pending' : 'subscribed',
      ...(input.tags !== undefined && input.tags.length > 0
        ? { tags: input.tags }
        : {}),
    };

    this.logger.log({
      message: 'newsletter.provider.mailchimp.upsert_started',
      requestId,
      email,
    });

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${this.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error({
        message: 'newsletter.provider.mailchimp.upsert_failed',
        requestId,
        email,
        status: res.status,
        detail,
      });
      throw new Error(`Mailchimp API error ${String(res.status)}: ${detail}`);
    }

    const parsed = (await res.json()) as {
      id?: string;
      status?: string;
    };

    this.logger.log({
      message: 'newsletter.provider.mailchimp.upsert_succeeded',
      requestId,
      email,
      providerSubscriberId: parsed.id ?? subscriberHash,
    });

    return {
      providerSubscriberId: parsed.id ?? subscriberHash,
      alreadyExisted:
        parsed.status === 'subscribed' || parsed.status === 'pending',
    };
  }

  async unsubscribe(email: string): Promise<void> {
    const requestId = this.cls.getId();
    const url = `https://${this.datacenter}.api.mailchimp.com/3.0/lists/${this.audienceId}/members/${md5(email.toLowerCase())}`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${this.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'unsubscribed' }),
    });

    if (!res.ok && res.status !== 404) {
      const detail = await res.text();
      throw new Error(`Mailchimp API error ${String(res.status)}: ${detail}`);
    }

    this.logger.log({
      message: 'newsletter.provider.mailchimp.unsubscribe_succeeded',
      requestId,
      email,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<VerifiedNewsletterWebhook | null> {
    const requestId = this.cls.getId();
    // Mailchimp passes the secret in `?s=…` — exposed to us via the routed
    // headers' x-forwarded-query or, in our setup, via a `mailchimp-secret`
    // header the controller copies in from req.query.s.
    const provided = headers['mailchimp-secret'] ?? '';
    if (
      !this.webhookSecret ||
      !this.constantTimeEqual(provided, this.webhookSecret)
    ) {
      this.logger.warn({
        message: 'newsletter.provider.mailchimp.verify_webhook_failed',
        requestId,
        reason: 'invalid_secret',
      });
      return null;
    }

    const form = new URLSearchParams(rawBody.toString('utf8'));
    const type = form.get('type') ?? '';
    const email = form.get('data[email]') ?? '';
    if (!email) return null;

    const mapped = mapMailchimpType(type);
    if (!mapped) return null;

    return {
      eventId: `${type}:${email}:${form.get('fired_at') ?? ''}`,
      type: mapped,
      email,
    };
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
}

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

function mapMailchimpType(
  type: string,
): VerifiedNewsletterWebhook['type'] | null {
  switch (type) {
    case 'unsubscribe':
      return 'unsubscribe';
    case 'cleaned':
      return 'bounce';
    case 'spam':
      return 'spam';
    case 'subscribe':
      return 'confirmed';
    default:
      return null;
  }
}
