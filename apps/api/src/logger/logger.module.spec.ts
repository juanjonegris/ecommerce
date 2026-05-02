import { Writable } from 'stream';

import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as winston from 'winston';

import { LoggerModule } from './logger.module';

const mockConfigService = { get: jest.fn().mockReturnValue('production') };

function makeCapture(): {
  stream: Writable;
  lines: () => Record<string, unknown>[];
} {
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      raw.push(chunk.toString().trim());
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      raw.filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('LoggerModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({ imports: [LoggerModule] })
      .overrideProvider('ConfigService')
      .useValue(mockConfigService)
      .compile();
  });

  afterEach(() => jest.clearAllMocks());

  it('provides WINSTON_MODULE_NEST_PROVIDER', () => {
    expect(module.get(WINSTON_MODULE_NEST_PROVIDER)).toBeDefined();
  });

  it('includes all required fields on a log entry', () => {
    const { stream, lines } = makeCapture();
    const logger = winston.createLogger({
      defaultMeta: { env: 'production' },
      transports: [
        new winston.transports.Stream({
          stream,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    });

    logger.info({
      message: 'test',
      requestId: 'req-1',
      module: 'Test',
      operation: 'op',
    });

    expect(lines()[0]).toMatchObject({
      message: 'test',
      requestId: 'req-1',
      env: 'production',
      module: 'Test',
      operation: 'op',
    });
  });

  it('default env field appears in every log entry', () => {
    const { stream, lines } = makeCapture();
    const logger = winston.createLogger({
      defaultMeta: { env: 'test' },
      transports: [
        new winston.transports.Stream({
          stream,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    });

    logger.info('hello');

    expect(lines()[0]).toMatchObject({ env: 'test', message: 'hello' });
  });

  it('JSON format entry includes timestamp', () => {
    const { stream, lines } = makeCapture();
    const logger = winston.createLogger({
      transports: [
        new winston.transports.Stream({
          stream,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
      ],
    });

    logger.info({ message: 'json-test', requestId: 'r1' });

    const entry = lines()[0] ?? {};
    expect(entry).toMatchObject({ message: 'json-test', requestId: 'r1' });
    expect(entry.timestamp).toBeDefined();
  });
});
