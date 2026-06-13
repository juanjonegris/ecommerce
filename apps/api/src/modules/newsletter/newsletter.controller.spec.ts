import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { createMockSubscriber } from '../../../test/factories/newsletter.factory';

import { NewsletterController } from './newsletter.controller';
import type { NewsletterService } from './newsletter.service';
import type {
  NewsletterProviderAdapter,
  VerifiedNewsletterWebhook,
} from './providers/newsletter-provider.interface';

const mockService = {
  subscribe: jest.fn(),
  confirm: jest.fn(),
  unsubscribe: jest.fn(),
  handleWebhook: jest.fn(),
  listForAdmin: jest.fn(),
  findById: jest.fn(),
  forceResync: jest.fn(),
  forceUnsubscribe: jest.fn(),
  remove: jest.fn(),
};

const mockProvider: jest.Mocked<NewsletterProviderAdapter> = {
  name: 'mailchimp',
  upsertSubscriber: jest.fn(),
  unsubscribe: jest.fn(),
  verifyWebhook: jest.fn(),
};

function makeRawReq(rawBody = Buffer.from('')): RawBodyRequest<Request> {
  return {
    rawBody,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    query: {},
  } as unknown as RawBodyRequest<Request>;
}

describe('NewsletterController', () => {
  let controller: NewsletterController;

  beforeEach(() => {
    controller = new NewsletterController(
      mockService as unknown as NewsletterService,
      mockProvider,
    );
    jest.clearAllMocks();
  });

  it('(1) POST /subscribe always returns { status: ACCEPTED }', async () => {
    mockService.subscribe.mockResolvedValue(undefined);
    const result = await controller.subscribe({ email: 'a@b.c' });
    expect(result).toEqual({
      status: 'ACCEPTED',
      message: expect.any(String) as unknown as string,
    });
  });

  it.each([
    ['CONFIRMED'] as const,
    ['ALREADY_CONFIRMED'] as const,
    ['INVALID_TOKEN'] as const,
  ])('(2) GET /confirm returns { status: %s }', async (status) => {
    mockService.confirm.mockResolvedValue(status);
    const result = await controller.confirm({ token: 'a'.repeat(64) });
    expect(result).toEqual({ status });
  });

  it('(3) POST /unsubscribe with token returns ACCEPTED', async () => {
    mockService.unsubscribe.mockResolvedValue(undefined);
    const result = await controller.unsubscribe({
      email: 'a@b.c',
      token: 'a'.repeat(64),
    });
    expect(result.status).toBe('ACCEPTED');
  });

  it('(3) POST /unsubscribe without token returns ACCEPTED', async () => {
    mockService.unsubscribe.mockResolvedValue(undefined);
    const result = await controller.unsubscribe({ email: 'a@b.c' });
    expect(result.status).toBe('ACCEPTED');
  });

  it('(4) POST /webhooks/:provider — verified → service.handleWebhook called', async () => {
    const verified: VerifiedNewsletterWebhook = {
      eventId: 'e',
      type: 'unsubscribe',
      email: 'a@b.c',
    };
    mockProvider.verifyWebhook.mockResolvedValue(verified);
    mockService.handleWebhook.mockResolvedValue(undefined);

    const result = await controller.webhook('mailchimp', makeRawReq());

    expect(result).toEqual({ received: true });
    expect(mockService.handleWebhook).toHaveBeenCalledWith(
      'mailchimp',
      verified,
    );
  });

  it('(5) POST /webhooks/:provider — null verifyWebhook → service NOT called', async () => {
    mockProvider.verifyWebhook.mockResolvedValue(null);
    const result = await controller.webhook('mailchimp', makeRawReq());
    expect(result).toEqual({ received: true });
    expect(mockService.handleWebhook).not.toHaveBeenCalled();
  });

  it('(7) GET / admin — paginated list; responses do NOT carry confirmationToken', async () => {
    mockService.listForAdmin.mockResolvedValue({
      data: [createMockSubscriber({ id: 's1' })],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await controller.findAll({});
    expect(result.total).toBe(1);
    for (const row of result.data) {
      expect(row).not.toHaveProperty('confirmationToken');
    }
  });

  it('(8) POST /:id/resync calls service.forceResync', async () => {
    mockService.forceResync.mockResolvedValue(
      createMockSubscriber({ id: 's1' }),
    );
    await controller.resync('s1');
    expect(mockService.forceResync).toHaveBeenCalledWith('s1');
  });
});
