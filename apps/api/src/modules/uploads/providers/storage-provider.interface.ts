/** Input for issuing a presigned PUT URL. */
export interface PresignUploadInput {
  storageKey: string;
  mimeType: string;
  maxBytes: number;
  /** Expiry in seconds (default 300 = 5 minutes). */
  expiresIn?: number;
}

export interface PresignUploadResult {
  uploadUrl: string;
  /** Headers the browser MUST include in the PUT (Content-Type, Content-Length). */
  requiredHeaders: Record<string, string>;
  /** Final public URL the row should store. */
  publicUrl: string;
  expiresAt: Date;
}

/** Input for a server-proxied multipart upload. */
export interface PutObjectInput {
  storageKey: string;
  mimeType: string;
  body: Buffer;
}

export interface PutObjectResult {
  publicUrl: string;
}

/** Result of a HEAD probe used by `confirm`. */
export interface HeadObjectResult {
  sizeBytes: number;
  mimeType: string | null;
}

/**
 * Object-storage port. Swap implementations (S3, MinIO, R2, …) by binding a
 * different class to STORAGE_PROVIDER in UploadsModule — no caller changes
 * required.
 */
export interface StorageProviderAdapter {
  readonly name: 's3' | 'stub';
  /** Idempotent — creates the bucket if missing, otherwise no-op. */
  ensureBucket(): Promise<void>;
  presignUpload(input: PresignUploadInput): Promise<PresignUploadResult>;
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  headObject(storageKey: string): Promise<HeadObjectResult | null>;
  delete(storageKey: string): Promise<void>;
  /** Sync helper used at presign time before the row is written. */
  publicUrlFor(storageKey: string): string;
}

/** DI token for the StorageProviderAdapter interface. */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
