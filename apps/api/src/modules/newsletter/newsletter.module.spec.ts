import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import { selectNewsletterProvider } from './newsletter.module';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => values[key] ?? ''),
  } as unknown as ConfigService;
}

describe('selectNewsletterProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NEWSLETTER_PROVIDER=mailchimp + key → MailchimpProvider', () => {
    const provider = selectNewsletterProvider(
      makeConfig({
        NEWSLETTER_PROVIDER: 'mailchimp',
        MAILCHIMP_API_KEY: 'abc-us21',
        MAILCHIMP_AUDIENCE_ID: 'aud',
      }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('mailchimp');
  });

  it('NEWSLETTER_PROVIDER=klaviyo + key → KlaviyoProvider', () => {
    const provider = selectNewsletterProvider(
      makeConfig({
        NEWSLETTER_PROVIDER: 'klaviyo',
        KLAVIYO_API_KEY: 'pk_test',
        KLAVIYO_LIST_ID: 'list-1',
      }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('klaviyo');
  });

  it('missing keys → StubNewsletterProvider + logs stub_selected', () => {
    const provider = selectNewsletterProvider(
      makeConfig({ NEWSLETTER_PROVIDER: 'mailchimp' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'newsletter.module.stub_selected',
      }),
    );
  });

  it("NEWSLETTER_PROVIDER='stub' falls through to stub even with keys present", () => {
    const provider = selectNewsletterProvider(
      makeConfig({
        NEWSLETTER_PROVIDER: 'stub',
        MAILCHIMP_API_KEY: 'abc-us21',
      }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
  });
});
