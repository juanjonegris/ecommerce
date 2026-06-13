import type { LoggerService } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { StubStorageProvider } from './stub.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

describe('StubStorageProvider', () => {
  let provider: StubStorageProvider;

  beforeEach(() => {
    provider = new StubStorageProvider(
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    jest.clearAllMocks();
  });

  it('ensureBucket logs and returns', async () => {
    await provider.ensureBucket();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'uploads.provider.stub.bucket_ensured',
      }),
    );
  });

  it('presignUpload returns localhost-prefixed urls + required headers', async () => {
    const result = await provider.presignUpload({
      storageKey: 'product-images/p1/abc.jpg',
      mimeType: 'image/jpeg',
      maxBytes: 1000,
    });
    expect(result.uploadUrl).toContain('http://localhost:3001/uploads-stub/');
    expect(result.publicUrl).toBe(result.uploadUrl);
    expect(result.requiredHeaders).toEqual({
      'Content-Type': 'image/jpeg',
      'Content-Length': '1000',
    });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('putObject discards buffer and returns publicUrl', async () => {
    const result = await provider.putObject({
      storageKey: 'product-images/p1/abc.jpg',
      mimeType: 'image/png',
      body: Buffer.from('not-really-an-image'),
    });
    expect(result.publicUrl).toContain('uploads-stub');
  });

  it('headObject returns fake success', async () => {
    await expect(provider.headObject('whatever')).resolves.toEqual({
      sizeBytes: 1,
      mimeType: 'image/jpeg',
    });
  });

  it('delete is a no-op that resolves', async () => {
    await expect(provider.delete('whatever')).resolves.toBeUndefined();
  });
});
