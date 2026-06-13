import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import { selectStorageProvider } from './uploads.module';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(values: Record<string, string | boolean>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => {
      if (key in values) return values[key];
      // Booleans (e.g. S3_FORCE_PATH_STYLE) default true; strings default ''
      return key === 'S3_FORCE_PATH_STYLE' ? true : '';
    }),
  } as unknown as ConfigService;
}

describe('selectStorageProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('all three S3 keys set → S3Provider', () => {
    const provider = selectStorageProvider(
      makeConfig({
        S3_ACCESS_KEY: 'a',
        S3_SECRET_KEY: 's',
        S3_BUCKET: 'b',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
      }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('s3');
  });

  it('missing S3_ACCESS_KEY → StubStorageProvider', () => {
    const provider = selectStorageProvider(
      makeConfig({ S3_SECRET_KEY: 's', S3_BUCKET: 'b' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'uploads.module.stub_selected' }),
    );
  });

  it('missing S3_SECRET_KEY → StubStorageProvider', () => {
    const provider = selectStorageProvider(
      makeConfig({ S3_ACCESS_KEY: 'a', S3_BUCKET: 'b' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
  });

  it('missing S3_BUCKET → StubStorageProvider', () => {
    const provider = selectStorageProvider(
      makeConfig({ S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(provider.name).toBe('stub');
  });
});
