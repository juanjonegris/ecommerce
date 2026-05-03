import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { LoggingInterceptor } from './logging.interceptor';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};
const mockCls = { getId: jest.fn().mockReturnValue('req-xyz') };

function makeContext(method = 'GET', url = '/items'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor(mockLogger, mockCls as never);
    jest.clearAllMocks();
  });

  it('logs request completion with method, url, statusCode, duration, requestId', (done) => {
    const handler: CallHandler = { handle: () => of({ data: 'ok' }) };
    interceptor.intercept(makeContext(), handler).subscribe({
      complete: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'http.interceptor.request_succeeded',
            method: 'GET',
            url: '/items',
            statusCode: 200,
            requestId: 'req-xyz',
          }),
        );
        done();
      },
    });
  });

  it('logs request failure on error', (done) => {
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('fail')),
    };
    interceptor.intercept(makeContext(), handler).subscribe({
      error: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'http.interceptor.request_failed',
            method: 'GET',
            url: '/items',
            requestId: 'req-xyz',
          }),
        );
        done();
      },
    });
  });

  it('includes duration as a number', (done) => {
    const handler: CallHandler = { handle: () => of(null) };
    interceptor.intercept(makeContext(), handler).subscribe({
      complete: () => {
        const call = mockLogger.log.mock.calls[0] as [Record<string, unknown>];
        expect(typeof call[0].duration).toBe('number');
        done();
      },
    });
  });
});
