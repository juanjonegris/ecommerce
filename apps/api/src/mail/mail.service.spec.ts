import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { ResendMailService } from './mail.service';
import type { SendMailOptions } from './mail.service';

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const mailOptions: SendMailOptions = {
  to: 'a@a.com',
  subject: 'Hi',
  html: '<p>Hi</p>',
  requestId: 'req-1',
};

describe('ResendMailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('dev stub (no RESEND_API_KEY)', () => {
    it('logs the payload and does not throw', async () => {
      const service = new ResendMailService(
        makeConfig({ RESEND_API_KEY: '', MAIL_FROM: 'x@x.com' }),
        mockLogger as unknown as LoggerService,
      );

      await expect(service.send(mailOptions)).resolves.toBeUndefined();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'mail.service.send_skipped' }),
      );
    });
  });

  describe('configured (RESEND_API_KEY set)', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
      global.fetch = fetchMock as unknown as typeof fetch;
      fetchMock.mockReset();
    });

    it('POSTs to the Resend API and logs success', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      const service = new ResendMailService(
        makeConfig({ RESEND_API_KEY: 'key', MAIL_FROM: 'from@x.com' }),
        mockLogger as unknown as LoggerService,
      );

      await service.send(mailOptions);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'mail.service.send_succeeded' }),
      );
    });

    it('throws and logs when the API responds with an error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      });
      const service = new ResendMailService(
        makeConfig({ RESEND_API_KEY: 'key', MAIL_FROM: 'from@x.com' }),
        mockLogger as unknown as LoggerService,
      );

      await expect(service.send(mailOptions)).rejects.toThrow(
        'Resend API error 500',
      );
    });
  });
});
