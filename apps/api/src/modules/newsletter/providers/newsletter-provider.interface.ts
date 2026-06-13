/** Input handed to a provider when adding/updating a subscriber. */
export interface UpsertSubscriberInput {
  email: string;
  tags?: string[];
  locale?: string;
  /** When true the provider should send its own opt-in email. We may still send
   * ours in single-opt-in mode for branding; the service controls policy. */
  doubleOptIn: boolean;
}

export interface UpsertSubscriberResult {
  providerSubscriberId: string;
  /** True when the provider already had this email — caller MAY no-op locally. */
  alreadyExisted: boolean;
}

/**
 * Verified inbound webhook from the provider. Returning null = authentic but
 * uninteresting event; handler should ack 200 and do nothing.
 */
export interface VerifiedNewsletterWebhook {
  eventId: string;
  type: 'unsubscribe' | 'bounce' | 'spam' | 'confirmed';
  email: string;
  providerSubscriberId?: string;
}

/**
 * Newsletter-provider port. Swap implementations (Mailchimp, Klaviyo, …) by
 * binding a different class to NEWSLETTER_PROVIDER in NewsletterModule — no
 * caller changes required.
 */
export interface NewsletterProviderAdapter {
  readonly name: 'mailchimp' | 'klaviyo' | 'stub';
  upsertSubscriber(
    input: UpsertSubscriberInput,
  ): Promise<UpsertSubscriberResult>;
  unsubscribe(email: string): Promise<void>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<VerifiedNewsletterWebhook | null>;
}

/** DI token for the NewsletterProviderAdapter interface. */
export const NEWSLETTER_PROVIDER = 'NEWSLETTER_PROVIDER';
