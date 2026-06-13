import { createHash } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type {
  NewsletterProviderAdapter,
  UpsertSubscriberInput,
  UpsertSubscriberResult,
  VerifiedNewsletterWebhook,
} from './newsletter-provider.interface';

/**
 * Dev-only NewsletterProvider. Selected by NewsletterModule's useFactory when
 * NEWSLETTER_PROVIDER='stub' or when the chosen provider's API key is empty.
 *
 * - upsertSubscriber returns deterministic md5(email) ids and never hits the network.
 * - unsubscribe is a no-op log.
 * - verifyWebhook returns null (uninteresting event).
 */
@Injectable()
export class StubNewsletterProvider implements NewsletterProviderAdapter {
  readonly name = 'stub' as const;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  upsertSubscriber(
    input: UpsertSubscriberInput,
  ): Promise<UpsertSubscriberResult> {
    const requestId = this.cls.getId();
    const providerSubscriberId = md5(input.email);
    this.logger.log({
      message: 'newsletter.provider.stub.upsert_succeeded',
      requestId,
      email: input.email,
      providerSubscriberId,
    });
    return Promise.resolve({ providerSubscriberId, alreadyExisted: false });
  }

  unsubscribe(email: string): Promise<void> {
    this.logger.log({
      message: 'newsletter.provider.stub.unsubscribe_succeeded',
      requestId: this.cls.getId(),
      email,
    });
    return Promise.resolve();
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<VerifiedNewsletterWebhook | null> {
    void rawBody;
    void headers;
    return Promise.resolve(null);
  }
}

function md5(input: string): string {
  return createHash('md5').update(input.toLowerCase()).digest('hex');
}
