import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '@/config/configuration';

import type {
  HeadObjectResult,
  PresignUploadInput,
  PresignUploadResult,
  PutObjectInput,
  PutObjectResult,
  StorageProviderAdapter,
} from './storage-provider.interface';

/**
 * Real S3-compatible storage backend. Works against MinIO (path-style
 * addressing), AWS S3 (virtual-hosted-style — default), and S3-compatible
 * targets like Cloudflare R2 / Backblaze B2. Selected by UploadsModule's
 * useFactory when S3_ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET are all non-empty.
 */
@Injectable()
export class S3Provider implements StorageProviderAdapter {
  readonly name = 's3' as const;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicUrlBase: string;

  constructor(
    config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {
    const endpoint =
      config.get<AppConfig['S3_ENDPOINT']>('S3_ENDPOINT') ??
      'http://localhost:9000';
    const accessKeyId =
      config.get<AppConfig['S3_ACCESS_KEY']>('S3_ACCESS_KEY') ?? '';
    const secretAccessKey =
      config.get<AppConfig['S3_SECRET_KEY']>('S3_SECRET_KEY') ?? '';
    const bucket = config.get<AppConfig['S3_BUCKET']>('S3_BUCKET') ?? '';
    const region =
      config.get<AppConfig['S3_REGION']>('S3_REGION') ?? 'us-east-1';
    const forcePathStyle =
      config.get<AppConfig['S3_FORCE_PATH_STYLE']>('S3_FORCE_PATH_STYLE') ??
      true;
    const publicUrl =
      config.get<AppConfig['S3_PUBLIC_URL']>('S3_PUBLIC_URL') ?? '';

    if (!bucket) {
      // Unreachable in normal boot — the module factory binds the stub when
      // credentials are missing. Throw loudly if forced.
      throw new Error('S3Provider requires S3_BUCKET');
    }

    this.endpoint = endpoint;
    this.bucket = bucket;
    this.publicUrlBase = publicUrl ? publicUrl : `${endpoint}/${bucket}`;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });
  }

  async ensureBucket(): Promise<void> {
    const requestId = this.cls.getId();
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log({
        message: 'uploads.provider.s3.bucket_ensured',
        requestId,
        bucket: this.bucket,
        existed: true,
      });
    } catch (err) {
      if (!isAwsNotFound(err)) {
        this.logger.error(
          {
            message: 'uploads.provider.s3.ensure_bucket_failed',
            requestId,
            bucket: this.bucket,
            error: errorMessage(err),
          },
          errorStack(err),
        );
        throw err;
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log({
        message: 'uploads.provider.s3.bucket_ensured',
        requestId,
        bucket: this.bucket,
        existed: false,
      });
    }
  }

  async presignUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
    const requestId = this.cls.getId();
    const expiresIn = input.expiresIn ?? 300;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ContentType: input.mimeType,
      ContentLength: input.maxBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    this.logger.log({
      message: 'uploads.provider.s3.presign_succeeded',
      requestId,
      storageKey: input.storageKey,
      expiresIn,
    });
    return {
      uploadUrl,
      requiredHeaders: {
        'Content-Type': input.mimeType,
        'Content-Length': String(input.maxBytes),
      },
      publicUrl: this.publicUrlFor(input.storageKey),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const requestId = this.cls.getId();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        Body: input.body,
        ContentType: input.mimeType,
        ContentLength: input.body.length,
      }),
    );
    this.logger.log({
      message: 'uploads.provider.s3.put_succeeded',
      requestId,
      storageKey: input.storageKey,
      bytes: input.body.length,
    });
    return { publicUrl: this.publicUrlFor(input.storageKey) };
  }

  async headObject(storageKey: string): Promise<HeadObjectResult | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return {
        sizeBytes: out.ContentLength ?? 0,
        mimeType: out.ContentType ?? null,
      };
    } catch (err) {
      if (isAwsNotFound(err)) return null;
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const requestId = this.cls.getId();
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      this.logger.log({
        message: 'uploads.provider.s3.delete_succeeded',
        requestId,
        storageKey,
      });
    } catch (err) {
      if (isAwsNotFound(err)) {
        this.logger.warn({
          message: 'uploads.provider.s3.delete_swallowed_404',
          requestId,
          storageKey,
        });
        return;
      }
      this.logger.error(
        {
          message: 'uploads.provider.s3.delete_failed',
          requestId,
          storageKey,
          error: errorMessage(err),
        },
        errorStack(err),
      );
      throw err;
    }
  }

  publicUrlFor(storageKey: string): string {
    return `${this.publicUrlBase}/${encodeURIComponent(storageKey)}`;
  }
}

function isAwsNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const meta = err as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (meta.name === 'NotFound' || meta.name === 'NoSuchKey') return true;
  return meta.$metadata?.httpStatusCode === 404;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}
