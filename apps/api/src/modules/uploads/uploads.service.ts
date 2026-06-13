import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ClsService } from 'nestjs-cls';

import type { PaginatedResponse } from '@repo/types';

import type { AppConfig } from '@/config/configuration';
import { ProductsRepository } from '@/modules/products/products.repository';
import { PrismaService } from '@/prisma/prisma.service';

import type { PresignUploadDto } from './dto/presign-upload.dto';
import type { UploadDirectMetadataDto } from './dto/upload-direct-metadata.dto';
import { ProductImageEntity } from './entities/product-image.entity';
import {
  STORAGE_PROVIDER,
  type StorageProviderAdapter,
} from './providers/storage-provider.interface';
import {
  UploadsRepository,
  type ListProductImagesFilters,
  type PaginationParams,
} from './uploads.repository';

export interface PresignUploadResult {
  imageId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  publicUrl: string;
  expiresAt: Date;
  mode: 's3' | 'stub';
}

export interface ReorderItem {
  id: string;
  order: number;
}

export interface ReorderImagesInput {
  productId: string;
  items: ReorderItem[];
}

const CLEANUP_AGE_MS = 60 * 60 * 1000;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

@Injectable()
export class UploadsService {
  constructor(
    private readonly repository: UploadsRepository,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProviderAdapter,
    private readonly productsRepository: ProductsRepository,
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  async presign(dto: PresignUploadDto): Promise<PresignUploadResult> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'uploads.service.presign_started',
      requestId,
      productId: dto.productId,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });

    this.assertMimeAllowed(dto.mimeType, requestId);
    this.assertSizeAllowed(dto.sizeBytes, requestId);

    const product = await this.productsRepository.findById(dto.productId);
    if (!product) {
      throw new NotFoundException(`Product "${dto.productId}" not found`);
    }

    const storageKey = this.buildStorageKey(dto.productId, dto.mimeType);
    const presign = await this.provider.presignUpload({
      storageKey,
      mimeType: dto.mimeType,
      maxBytes: dto.sizeBytes,
    });

    const created = await this.prisma.$transaction(async (tx) =>
      this.repository.create(
        {
          productId: dto.productId,
          storageKey,
          url: presign.publicUrl,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          width: dto.width ?? null,
          height: dto.height ?? null,
        },
        tx,
      ),
    );

    this.logger.log({
      message: 'uploads.service.presign_succeeded',
      requestId,
      imageId: created.id,
      storageKey,
      mode: this.provider.name,
    });

    return {
      imageId: created.id,
      uploadUrl: presign.uploadUrl,
      requiredHeaders: presign.requiredHeaders,
      publicUrl: presign.publicUrl,
      expiresAt: presign.expiresAt,
      mode: this.provider.name,
    };
  }

  async confirm(imageId: string): Promise<ProductImageEntity> {
    const requestId = this.cls.getId();
    const row = await this.findById(imageId);
    if (row.status === 'READY') return row;

    const head = await this.provider.headObject(row.storageKey);
    if (head === null) {
      this.logger.warn({
        message: 'uploads.service.confirm_missing_object',
        requestId,
        imageId,
        storageKey: row.storageKey,
      });
      throw new BadRequestException('upload not found in storage');
    }
    if (head.sizeBytes > row.sizeBytes) {
      throw new BadRequestException('uploaded size exceeds declared size');
    }

    const updated = await this.prisma.$transaction(async (tx) =>
      this.repository.update(row.id, { status: 'READY' }, tx),
    );
    this.logger.log({
      message: 'uploads.service.confirm_succeeded',
      requestId,
      imageId,
    });
    return updated;
  }

  async uploadDirect(
    file: Express.Multer.File,
    metadata: UploadDirectMetadataDto,
  ): Promise<ProductImageEntity> {
    const requestId = this.cls.getId();
    this.logger.log({
      message: 'uploads.service.upload_direct_started',
      requestId,
      productId: metadata.productId,
      mimeType: metadata.mimeType,
      sizeBytes: file.size,
    });

    this.assertMimeAllowed(metadata.mimeType, requestId);
    if (file.mimetype !== metadata.mimeType) {
      throw new BadRequestException(
        'file mimetype does not match metadata.mimeType',
      );
    }
    this.assertSizeAllowed(file.size, requestId);

    const product = await this.productsRepository.findById(metadata.productId);
    if (!product) {
      throw new NotFoundException(`Product "${metadata.productId}" not found`);
    }

    const storageKey = this.buildStorageKey(
      metadata.productId,
      metadata.mimeType,
    );
    const put = await this.provider.putObject({
      storageKey,
      mimeType: metadata.mimeType,
      body: file.buffer,
    });

    const created = await this.prisma.$transaction(async (tx) =>
      this.repository.create(
        {
          productId: metadata.productId,
          storageKey,
          url: put.publicUrl,
          mimeType: metadata.mimeType,
          sizeBytes: file.size,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
        },
        tx,
      ),
    );

    const ready = await this.repository.update(created.id, { status: 'READY' });
    this.logger.log({
      message: 'uploads.service.upload_direct_succeeded',
      requestId,
      imageId: ready.id,
      storageKey,
      bytes: file.size,
    });
    return ready;
  }

  async findById(id: string): Promise<ProductImageEntity> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException(`Product image "${id}" not found`);
    return row;
  }

  async listForAdmin(
    filters: ListProductImagesFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<ProductImageEntity>> {
    return this.repository.listByProductForAdmin(filters, pagination);
  }

  async remove(id: string): Promise<void> {
    const requestId = this.cls.getId();
    const row = await this.findById(id);
    await this.prisma.$transaction(async (tx) =>
      this.repository.remove(row.id, tx),
    );
    try {
      await this.provider.delete(row.storageKey);
    } catch (err) {
      this.logger.warn({
        message: 'uploads.service.remove_provider_failed',
        requestId,
        imageId: id,
        storageKey: row.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.logger.log({
      message: 'uploads.service.remove_succeeded',
      requestId,
      imageId: id,
    });
  }

  async reorder(input: ReorderImagesInput): Promise<ProductImageEntity[]> {
    const requestId = this.cls.getId();
    const ids = input.items.map((i) => i.id);
    const rows = await this.repository.listByIds(ids);
    if (rows.length !== input.items.length) {
      throw new BadRequestException('one or more image ids do not exist');
    }
    for (const row of rows) {
      if (row.productId !== input.productId) {
        throw new BadRequestException(
          'image does not belong to the requested product',
        );
      }
    }

    await this.prisma.$transaction(async (tx) =>
      this.repository.bulkUpdateOrder(input.items, tx),
    );

    const updated = await this.repository.listByProductForAdmin(
      { productId: input.productId },
      { page: 1, limit: 100 },
    );
    this.logger.log({
      message: 'uploads.service.reorder_succeeded',
      requestId,
      productId: input.productId,
      count: input.items.length,
    });
    return updated.data;
  }

  async cleanupStaleUploads(): Promise<{
    confirmed: number;
    removed: number;
  }> {
    const requestId = this.cls.getId();
    const cutoff = new Date(Date.now() - CLEANUP_AGE_MS);
    const stale = await this.repository.listStalePendingUploads(cutoff);
    let confirmed = 0;
    let removed = 0;

    for (const row of stale) {
      const head = await this.provider.headObject(row.storageKey);
      if (head !== null) {
        await this.repository.update(row.id, { status: 'READY' });
        confirmed++;
      } else {
        await this.prisma.$transaction(async (tx) =>
          this.repository.remove(row.id, tx),
        );
        try {
          await this.provider.delete(row.storageKey);
        } catch {
          // best-effort — the object isn't there anyway
        }
        removed++;
      }
    }

    this.logger.log({
      message: 'uploads.service.cleanup_swept',
      requestId,
      confirmed,
      removed,
    });
    return { confirmed, removed };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private assertMimeAllowed(mime: string, requestId: string | undefined): void {
    const allowed = this.allowedMimes();
    if (!allowed.includes(mime)) {
      this.logger.warn({
        message: 'uploads.service.presign_rejected_mime',
        requestId,
        mimeType: mime,
      });
      throw new BadRequestException(`mime type "${mime}" not allowed`);
    }
  }

  private assertSizeAllowed(
    sizeBytes: number,
    requestId: string | undefined,
  ): void {
    const max = this.maxBytes();
    if (sizeBytes > max) {
      this.logger.warn({
        message: 'uploads.service.presign_rejected_size',
        requestId,
        sizeBytes,
        max,
      });
      throw new BadRequestException(
        `size ${String(sizeBytes)} exceeds maximum ${String(max)}`,
      );
    }
  }

  private allowedMimes(): string[] {
    return (
      this.config.get<AppConfig['UPLOAD_ALLOWED_MIMES']>(
        'UPLOAD_ALLOWED_MIMES',
      ) ?? []
    );
  }

  private maxBytes(): number {
    return (
      this.config.get<AppConfig['UPLOAD_MAX_BYTES']>('UPLOAD_MAX_BYTES') ??
      5_242_880
    );
  }

  private buildStorageKey(productId: string, mime: string): string {
    const ext = MIME_EXT[mime];
    if (!ext) {
      // assertMimeAllowed should have caught this; keep the guard for safety
      throw new BadRequestException(`unsupported mime type "${mime}"`);
    }
    return `product-images/${productId}/${randomUUID()}.${ext}`;
  }
}
