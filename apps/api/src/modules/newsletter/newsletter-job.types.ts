/** Name of the BullMQ queue that handles provider sync calls. */
export const NEWSLETTER_QUEUE = 'newsletter';

export interface NewsletterJobBase {
  /** Stamped by the typed producer so worker logs correlate with the originating
   *  HTTP request (CLS is not available inside BullMQ workers). */
  requestId?: string;
}

export interface UpsertSubscriberJob extends NewsletterJobBase {
  subscriberId: string;
}

export interface UnsubscribeJob extends NewsletterJobBase {
  email: string;
}

export type NewsletterJobData = UpsertSubscriberJob | UnsubscribeJob;
