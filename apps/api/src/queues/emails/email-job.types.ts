/** Name of the BullMQ queue that handles all transactional email jobs. */
export const EMAILS_QUEUE = 'emails';

/** Fields common to every email job. requestId correlates worker logs back to
 * the originating HTTP request (CLS is not available inside BullMQ workers). */
export interface EmailJobBase {
  requestId?: string;
}

export interface OrderConfirmationJob extends EmailJobBase {
  to: string;
  orderId: string;
  total: number;
}

export interface PasswordResetJob extends EmailJobBase {
  to: string;
  resetUrl: string;
}

export interface WelcomeJob extends EmailJobBase {
  to: string;
  name?: string;
}

/** Discriminated by the BullMQ job name in EmailProcessor. */
export type EmailJobData = OrderConfirmationJob | PasswordResetJob | WelcomeJob;
