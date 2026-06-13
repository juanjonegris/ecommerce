import { createHmac, timingSafeEqual } from 'crypto';

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

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

interface KlaviyoBulkJobResponse {
  data?: {
    id?: string;
    type?: string;
  };
}

interface KlaviyoWebhookBody {
  data?: {
    id?: string;
    attributes?: {
      metric?: { name?: string };
      profile?: { email?: string; id?: string };
    };
  };
}

/**
 * Real Klaviyo-backed provider. Selected by NewsletterModule's useFactory
 * when NEWSLETTER_PROVIDER='klaviyo' AND KLAVIYO_API_KEY is non-empty.
 *
 * Auth: `Authorization: Klaviyo-API-Key <key>` plus `revision` header.
 * Webhook verification: HMAC-SHA256 of the raw body, base64-encoded, compared
 * constant-time to the `X-Klaviyo-Signature` header.
 */
@Injectable()
export class KlaviyoProvider implements NewsletterProviderAdapter {
  readonly name = 'klaviyo' as const;

  private readonly apiKey: string;
  private readonly listId: string;
  private readonly webhookSecret: string;

  constructor(
    config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.apiKey =
      config.get<AppConfig['KLAVIYO_API_KEY']>('KLAVIYO_API_KEY') ?? '';
    this.listId =
      config.get<AppConfig['KLAVIYO_LIST_ID']>('KLAVIYO_LIST_ID') ?? '';
    this.webhookSecret =
      config.get<AppConfig['KLAVIYO_WEBHOOK_SECRET']>(
        'KLAVIYO_WEBHOOK_SECRET',
      ) ?? '';
    if (!this.apiKey) {
      throw new Error('KlaviyoProvider requires KLAVIYO_API_KEY');
    }
  }

  async upsertSubscriber(
    input: UpsertSubscriberInput,
  ): Promise<UpsertSubscriberResult> {
    const requestId = this.cls.getId();
    const email = input.email.toLowerCase();

    const body = {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          custom_source: 'newsletter-module',
          profiles: {
            data: [
              {
                type: 'profile',
                attributes: {
                  email,
                  subscriptions: {
                    email: {
                      marketing: {
                        consent: input.doubleOptIn
                          ? 'SUBSCRIBED_WITH_DOUBLE_OPT_IN'
                          : 'SUBSCRIBED',
                      },
                    },
                  },
                  ...(input.locale !== undefined
                    ? { properties: { locale: input.locale } }
                    : {}),
                },
              },
            ],
          },
        },
        relationships: {
          list: { data: { type: 'list', id: this.listId } },
        },
      },
    };

    this.logger.log({
      message: 'newsletter.provider.klaviyo.upsert_started',
      requestId,
      email,
    });

    const res = await fetch(
      `${KLAVIYO_API_BASE}/profile-subscription-bulk-create-jobs/`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error({
        message: 'newsletter.provider.klaviyo.upsert_failed',
        requestId,
        email,
        status: res.status,
        detail,
      });
      throw new Error(`Klaviyo API error ${String(res.status)}: ${detail}`);
    }

    let parsed: KlaviyoBulkJobResponse = {};
    try {
      parsed = (await res.json()) as KlaviyoBulkJobResponse;
    } catch {
      // 202 responses sometimes have no body — fall through to email-as-id fallback.
    }

    const providerSubscriberId = parsed.data?.id ?? email;
    this.logger.log({
      message: 'newsletter.provider.klaviyo.upsert_succeeded',
      requestId,
      email,
      providerSubscriberId,
    });
    return { providerSubscriberId, alreadyExisted: false };
  }

  async unsubscribe(email: string): Promise<void> {
    const requestId = this.cls.getId();
    const body = {
      data: {
        type: 'profile-suppression-bulk-create-job',
        attributes: {
          profiles: {
            data: [
              {
                type: 'profile',
                attributes: { email: email.toLowerCase() },
              },
            ],
          },
        },
      },
    };

    const res = await fetch(
      `${KLAVIYO_API_BASE}/profile-suppression-bulk-create-jobs/`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );

    if (!res.ok && res.status !== 404) {
      const detail = await res.text();
      throw new Error(`Klaviyo API error ${String(res.status)}: ${detail}`);
    }

    this.logger.log({
      message: 'newsletter.provider.klaviyo.unsubscribe_succeeded',
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
    const provided = headers['x-klaviyo-signature'] ?? '';
    if (!this.webhookSecret || !provided) {
      this.logger.warn({
        message: 'newsletter.provider.klaviyo.verify_webhook_failed',
        requestId,
        reason: 'missing_signature_or_secret',
      });
      return null;
    }

    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      this.logger.warn({
        message: 'newsletter.provider.klaviyo.verify_webhook_failed',
        requestId,
        reason: 'invalid_signature',
      });
      return null;
    }

    let parsed: KlaviyoWebhookBody;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as KlaviyoWebhookBody;
    } catch {
      return null;
    }

    const email = parsed.data?.attributes?.profile?.email;
    const metric = parsed.data?.attributes?.metric?.name ?? '';
    if (!email) return null;

    const mapped = mapKlaviyoMetric(metric);
    if (!mapped) return null;

    const result: VerifiedNewsletterWebhook = {
      eventId: parsed.data?.id ?? `${metric}:${email}`,
      type: mapped,
      email,
    };
    const profileId = parsed.data?.attributes?.profile?.id;
    if (profileId !== undefined) {
      result.providerSubscriberId = profileId;
    }
    return result;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Klaviyo-API-Key ${this.apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
      revision: KLAVIYO_REVISION,
    };
  }
}

function mapKlaviyoMetric(
  metric: string,
): VerifiedNewsletterWebhook['type'] | null {
  switch (metric) {
    case 'Unsubscribed from List':
    case 'Unsubscribed':
      return 'unsubscribe';
    case 'Bounced Email':
      return 'bounce';
    case 'Marked Email as Spam':
      return 'spam';
    case 'Subscribed to List':
      return 'confirmed';
    default:
      return null;
  }
}
