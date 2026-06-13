import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type {
  HeadObjectResult,
  PresignUploadInput,
  PresignUploadResult,
  PutObjectInput,
  PutObjectResult,
  StorageProviderAdapter,
} from './storage-provider.interface';

const STUB_PUBLIC_PREFIX = 'http://localhost:3001/uploads-stub';

/**
 * Zero-network storage provider. Selected by UploadsModule's useFactory when
 * any of S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET is empty. Returns
 * deterministic localhost-prefixed URLs so the API contracts stay verifiable
 * offline; never opens a socket.
 */
@Injectable()
export class StubStorageProvider implements StorageProviderAdapter {
  readonly name = 'stub' as const;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async ensureBucket(): Promise<void> {
    this.logger.log({
      message: 'uploads.provider.stub.bucket_ensured',
      requestId: this.cls.getId(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async presignUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
    const expiresIn = input.expiresIn ?? 300;
    const publicUrl = this.publicUrlFor(input.storageKey);
    this.logger.log({
      message: 'uploads.provider.stub.presign_logged',
      requestId: this.cls.getId(),
      storageKey: input.storageKey,
    });
    return {
      uploadUrl: publicUrl,
      requiredHeaders: {
        'Content-Type': input.mimeType,
        'Content-Length': String(input.maxBytes),
      },
      publicUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.logger.log({
      message: 'uploads.provider.stub.put_logged',
      requestId: this.cls.getId(),
      storageKey: input.storageKey,
      bytes: input.body.length,
    });
    return { publicUrl: this.publicUrlFor(input.storageKey) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async headObject(storageKey: string): Promise<HeadObjectResult | null> {
    void storageKey;
    return { sizeBytes: 1, mimeType: 'image/jpeg' };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(storageKey: string): Promise<void> {
    void storageKey;
  }

  publicUrlFor(storageKey: string): string {
    return `${STUB_PUBLIC_PREFIX}/${encodeURIComponent(storageKey)}`;
  }
}
