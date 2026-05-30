import type { Queue } from 'bullmq';
import type { ClsService } from 'nestjs-cls';

import { EmailQueue } from './email-queue.service';

const mockQueue = { add: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('EmailQueue', () => {
  let producer: EmailQueue;

  beforeEach(() => {
    producer = new EmailQueue(
      mockQueue as unknown as Queue,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
    mockCls.getId.mockReturnValue('req-id');
  });

  it('enqueues an order-confirmation job with requestId from CLS', async () => {
    await producer.enqueueOrderConfirmation({
      to: 'a@a.com',
      orderId: 'o1',
      total: 50,
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'order-confirmation',
      expect.objectContaining({
        to: 'a@a.com',
        orderId: 'o1',
        total: 50,
        requestId: 'req-id',
      }),
    );
  });

  it('enqueues a welcome job', async () => {
    await producer.enqueueWelcome({ to: 'b@b.com', name: 'Bob' });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'welcome',
      expect.objectContaining({ to: 'b@b.com', requestId: 'req-id' }),
    );
  });

  it('enqueues a password-reset job', async () => {
    await producer.enqueuePasswordReset({
      to: 'c@c.com',
      resetUrl: 'https://x/reset',
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'password-reset',
      expect.objectContaining({
        resetUrl: 'https://x/reset',
        requestId: 'req-id',
      }),
    );
  });

  it('preserves an explicit requestId when one is already set', async () => {
    await producer.enqueueWelcome({ to: 'd@d.com', requestId: 'explicit' });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'welcome',
      expect.objectContaining({ requestId: 'explicit' }),
    );
  });
});
