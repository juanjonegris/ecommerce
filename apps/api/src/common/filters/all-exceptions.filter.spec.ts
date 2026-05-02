import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};
const mockCls = { getId: jest.fn().mockReturnValue('req-abc') };

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter(mockLogger, mockCls as never);
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/test' }),
        getResponse: () => ({ status: statusMock }),
      }),
    } as unknown as ArgumentsHost;
    jest.clearAllMocks();
    statusMock.mockReturnValue({ json: jsonMock });
  });

  it('returns correct shape for NotFoundException', () => {
    filter.catch(new NotFoundException('Product not found'), host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.NOT_FOUND }),
    );
  });

  it('returns 500 and logs with requestId for unhandled errors', () => {
    const err = new Error('boom');
    filter.catch(err, host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-abc',
        message: 'Unhandled exception',
      }),
      err.stack,
    );
  });

  it('does not log HttpExceptions as errors', () => {
    filter.catch(new HttpException('Bad', HttpStatus.BAD_REQUEST), host);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
