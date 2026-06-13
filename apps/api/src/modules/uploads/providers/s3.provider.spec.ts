const sendMock = jest.fn();
const getSignedUrlMock: jest.Mock<Promise<string>, unknown[]> = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = sendMock;
  }
  class HeadBucketCommand {
    constructor(public readonly input: unknown) {}
  }
  class CreateBucketCommand {
    constructor(public readonly input: unknown) {}
  }
  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class HeadObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  return {
    S3Client,
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]): Promise<string> =>
    getSignedUrlMock(...args),
}));

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

import { S3Provider } from './s3.provider';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeConfig(
  overrides: Record<string, string | boolean> = {},
): ConfigService {
  const values: Record<string, string | boolean> = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    S3_BUCKET: 'test-bucket',
    S3_REGION: 'us-east-1',
    S3_PUBLIC_URL: '',
    S3_FORCE_PATH_STYLE: true,
    ...overrides,
  };
  return {
    get: jest.fn((key: string): unknown => values[key]),
  } as unknown as ConfigService;
}

function notFoundError(): Error {
  const err: Error & {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  } = new Error('Not Found');
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

function noSuchKeyError(): Error {
  const err: Error & {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  } = new Error('NoSuchKey');
  err.name = 'NoSuchKey';
  return err;
}

describe('S3Provider', () => {
  let provider: S3Provider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new S3Provider(
      makeConfig(),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
  });

  it('throws at construction when S3_BUCKET is empty', () => {
    expect(
      () =>
        new S3Provider(
          makeConfig({ S3_BUCKET: '' }),
          mockLogger as unknown as LoggerService,
          mockCls as unknown as ClsService,
        ),
    ).toThrow(/S3_BUCKET/);
  });

  it('ensureBucket calls CreateBucket when HeadBucket 404s', async () => {
    sendMock.mockRejectedValueOnce(notFoundError());
    sendMock.mockResolvedValueOnce({});
    await provider.ensureBucket();
    expect(sendMock).toHaveBeenNthCalledWith(1, expect.any(HeadBucketCommand));
    expect(sendMock).toHaveBeenNthCalledWith(
      2,
      expect.any(CreateBucketCommand),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'uploads.provider.s3.bucket_ensured',
        existed: false,
      }),
    );
  });

  it('ensureBucket does NOT CreateBucket when HeadBucket succeeds', async () => {
    sendMock.mockResolvedValueOnce({});
    await provider.ensureBucket();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ existed: true }),
    );
  });

  it('presignUpload returns uploadUrl + required headers', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example.com/put');
    const result = await provider.presignUpload({
      storageKey: 'product-images/p1/abc.jpg',
      mimeType: 'image/jpeg',
      maxBytes: 524288,
    });
    expect(result.uploadUrl).toBe('https://signed.example.com/put');
    expect(result.requiredHeaders).toEqual({
      'Content-Type': 'image/jpeg',
      'Content-Length': '524288',
    });
    expect(result.publicUrl).toContain('http://localhost:9000/test-bucket/');
  });

  it('putObject builds PutObjectCommand with ContentLength = body.length', async () => {
    sendMock.mockResolvedValueOnce({});
    const body = Buffer.from('hello-world');
    const result = await provider.putObject({
      storageKey: 'k.jpg',
      mimeType: 'image/jpeg',
      body,
    });
    const command = sendMock.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(
      (command as { input: { ContentLength: number } }).input.ContentLength,
    ).toBe(body.length);
    expect(result.publicUrl).toContain('test-bucket');
  });

  it('headObject returns null on NoSuchKey', async () => {
    sendMock.mockRejectedValueOnce(noSuchKeyError());
    await expect(provider.headObject('missing.jpg')).resolves.toBeNull();
    expect(sendMock).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('delete swallows 404 errors', async () => {
    sendMock.mockRejectedValueOnce(noSuchKeyError());
    await expect(provider.delete('missing.jpg')).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'uploads.provider.s3.delete_swallowed_404',
      }),
    );
  });

  it('publicUrlFor honors S3_PUBLIC_URL override', () => {
    const overridden = new S3Provider(
      makeConfig({ S3_PUBLIC_URL: 'https://cdn.example.com' }),
      mockLogger as unknown as LoggerService,
      mockCls as unknown as ClsService,
    );
    expect(overridden.publicUrlFor('a/b.jpg')).toBe(
      'https://cdn.example.com/a%2Fb.jpg',
    );
  });
});
