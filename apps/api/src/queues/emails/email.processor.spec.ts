import type { LoggerService } from '@nestjs/common';
import type { Job } from 'bullmq';

import type { MailService } from '@/mail/mail.service';

import type { EmailJobData } from './email-job.types';
import { EmailProcessor } from './email.processor';

const mockMail = { send: jest.fn() };
const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

function makeJob(name: string, data: EmailJobData): Job<EmailJobData> {
  return { id: 'job-1', name, data } as unknown as Job<EmailJobData>;
}

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    processor = new EmailProcessor(
      mockMail as unknown as MailService,
      mockLogger as unknown as LoggerService,
    );
    jest.clearAllMocks();
  });

  it('dispatches an order-confirmation job to the mail service', async () => {
    mockMail.send.mockResolvedValue(undefined);

    await processor.process(
      makeJob('order-confirmation', {
        to: 'a@a.com',
        orderId: 'o1',
        total: 99,
        requestId: 'r1',
      }),
    );

    expect(mockMail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@a.com', requestId: 'r1' }),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'email.processor.process_succeeded' }),
    );
  });

  it('dispatches welcome and password-reset jobs', async () => {
    mockMail.send.mockResolvedValue(undefined);

    await processor.process(makeJob('welcome', { to: 'b@b.com', name: 'Bo' }));
    await processor.process(
      makeJob('password-reset', { to: 'c@c.com', resetUrl: 'https://x/reset' }),
    );

    expect(mockMail.send).toHaveBeenCalledTimes(2);
  });

  it('rethrows and logs failure so BullMQ retries', async () => {
    mockMail.send.mockRejectedValue(new Error('smtp down'));

    await expect(
      processor.process(makeJob('welcome', { to: 'b@b.com' })),
    ).rejects.toThrow('smtp down');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'email.processor.process_failed' }),
      expect.anything(),
    );
  });

  it('throws on an unknown job name', async () => {
    await expect(
      processor.process(
        makeJob('nope', { to: 'x@x.com' } as unknown as EmailJobData),
      ),
    ).rejects.toThrow('Unknown email job');
  });
});
