import {
  BadRequestException,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';

import type { ProductsRepository } from '@/modules/products/products.repository';
import type { PrismaService } from '@/prisma/prisma.service';

import { createMockProductImage } from '../../../test/factories/product-image.factory';
import { createMockProduct } from '../../../test/factories/product.factory';

import type { StorageProviderAdapter } from './providers/storage-provider.interface';
import type { UploadsRepository } from './uploads.repository';
import { UploadsService } from './uploads.service';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCls = { getId: jest.fn().mockReturnValue('req-id') };

function makeRepo(): jest.Mocked<
  Pick<
    UploadsRepository,
    | 'create'
    | 'findById'
    | 'update'
    | 'listByProductForAdmin'
    | 'listStalePendingUploads'
    | 'bulkUpdateOrder'
    | 'listByIds'
    | 'remove'
  >
> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    listByProductForAdmin: jest.fn(),
    listStalePendingUploads: jest.fn(),
    bulkUpdateOrder: jest.fn(),
    listByIds: jest.fn(),
    remove: jest.fn(),
  };
}

function makeProductsRepo(): jest.Mocked<Pick<ProductsRepository, 'findById'>> {
  return { findById: jest.fn() };
}

function makeProvider(): jest.Mocked<StorageProviderAdapter> {
  return {
    name: 's3',
    ensureBucket: jest.fn(),
    presignUpload: jest.fn(),
    putObject: jest.fn(),
    headObject: jest.fn(),
    delete: jest.fn(),
    publicUrlFor: jest.fn((k: string) => `http://test/${k}`),
  } as unknown as jest.Mocked<StorageProviderAdapter>;
}

function makeConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string): unknown => values[key]),
  } as unknown as ConfigService;
}

function makePrismaPassthrough(): PrismaService {
  return {
    $transaction: jest.fn().mockImplementation((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: Prisma.TransactionClient) => unknown)(
          {} as Prisma.TransactionClient,
        );
      }
      return cb;
    }),
  } as unknown as PrismaService;
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  UPLOAD_ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  UPLOAD_MAX_BYTES: 5_242_880,
};

function makeService(
  overrides: {
    config?: Record<string, unknown>;
    provider?: jest.Mocked<StorageProviderAdapter>;
  } = {},
): {
  service: UploadsService;
  repo: ReturnType<typeof makeRepo>;
  productsRepo: ReturnType<typeof makeProductsRepo>;
  provider: jest.Mocked<StorageProviderAdapter>;
} {
  const repo = makeRepo();
  const productsRepo = makeProductsRepo();
  const provider = overrides.provider ?? makeProvider();
  const service = new UploadsService(
    repo as unknown as UploadsRepository,
    makePrismaPassthrough(),
    provider,
    productsRepo as unknown as ProductsRepository,
    makeConfig({ ...DEFAULT_CONFIG, ...(overrides.config ?? {}) }),
    mockLogger as unknown as LoggerService,
    mockCls as unknown as ClsService,
  );
  return { service, repo, productsRepo, provider };
}

describe('UploadsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('presign', () => {
    it('happy path: validates product, presigns, persists PENDING_UPLOAD row', async () => {
      const { service, repo, productsRepo, provider } = makeService();
      productsRepo.findById.mockResolvedValue(createMockProduct({ id: 'p1' }));
      provider.presignUpload.mockResolvedValue({
        uploadUrl: 'https://signed/x',
        requiredHeaders: { 'Content-Type': 'image/jpeg' },
        publicUrl: 'https://public/x',
        expiresAt: new Date('2026-06-13T12:05:00Z'),
      });
      repo.create.mockResolvedValue(
        createMockProductImage({ id: 'img-1', productId: 'p1' }),
      );

      const result = await service.presign({
        productId: 'p1',
        fileName: 'hero.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      });

      expect(result.imageId).toBe('img-1');
      expect(result.uploadUrl).toBe('https://signed/x');
      expect(result.mode).toBe('s3');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'p1',
          mimeType: 'image/jpeg',
          sizeBytes: 1000,
        }),
        expect.anything(),
      );
    });

    it('throws NotFound when product missing', async () => {
      const { service, productsRepo } = makeService();
      productsRepo.findById.mockResolvedValue(null);
      await expect(
        service.presign({
          productId: 'nope',
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest on disallowed MIME', async () => {
      const { service } = makeService();
      await expect(
        service.presign({
          productId: 'p1',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest on sizeBytes > UPLOAD_MAX_BYTES', async () => {
      const { service } = makeService();
      await expect(
        service.presign({
          productId: 'p1',
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10_000_000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['image/avif', 'avif'],
    ])(
      'storageKey extension matches mime %s → %s',
      async (mime, expectedExt) => {
        const { service, repo, productsRepo, provider } = makeService();
        productsRepo.findById.mockResolvedValue(
          createMockProduct({ id: 'p1' }),
        );
        provider.presignUpload.mockResolvedValue({
          uploadUrl: 'u',
          requiredHeaders: {},
          publicUrl: 'pub',
          expiresAt: new Date(),
        });
        repo.create.mockResolvedValue(createMockProductImage());

        await service.presign({
          productId: 'p1',
          fileName: 'x',
          mimeType: mime,
          sizeBytes: 100,
        });

        const call = repo.create.mock.calls[0]?.[0] as {
          storageKey: string;
        };
        expect(call.storageKey).toMatch(
          new RegExp(`^product-images/p1/[a-f0-9-]+\\.${expectedExt}$`),
        );
      },
    );
  });

  describe('confirm', () => {
    it('idempotent on READY — returns row without HEAD call', async () => {
      const { service, repo, provider } = makeService();
      const row = createMockProductImage({ id: 'img-1', status: 'READY' });
      repo.findById.mockResolvedValue(row);
      const result = await service.confirm('img-1');
      expect(result.status).toBe('READY');
      expect(provider.headObject).not.toHaveBeenCalled();
    });

    it('flips PENDING_UPLOAD → READY on HEAD success', async () => {
      const { service, repo, provider } = makeService();
      repo.findById.mockResolvedValue(
        createMockProductImage({
          id: 'img-1',
          status: 'PENDING_UPLOAD',
          sizeBytes: 1000,
        }),
      );
      provider.headObject.mockResolvedValue({
        sizeBytes: 800,
        mimeType: 'image/jpeg',
      });
      repo.update.mockResolvedValue(
        createMockProductImage({ id: 'img-1', status: 'READY' }),
      );
      const result = await service.confirm('img-1');
      expect(result.status).toBe('READY');
      expect(repo.update).toHaveBeenCalledWith(
        'img-1',
        { status: 'READY' },
        expect.anything(),
      );
    });

    it('throws BadRequest when storage HEAD returns null', async () => {
      const { service, repo, provider } = makeService();
      repo.findById.mockResolvedValue(
        createMockProductImage({ id: 'img-1', status: 'PENDING_UPLOAD' }),
      );
      provider.headObject.mockResolvedValue(null);
      await expect(service.confirm('img-1')).rejects.toThrow(
        /not found in storage/,
      );
    });

    it('throws BadRequest when uploaded size exceeds declared', async () => {
      const { service, repo, provider } = makeService();
      repo.findById.mockResolvedValue(
        createMockProductImage({
          id: 'img-1',
          status: 'PENDING_UPLOAD',
          sizeBytes: 1000,
        }),
      );
      provider.headObject.mockResolvedValue({
        sizeBytes: 9999,
        mimeType: 'image/jpeg',
      });
      await expect(service.confirm('img-1')).rejects.toThrow(
        /exceeds declared/,
      );
    });
  });

  describe('uploadDirect', () => {
    const file = {
      buffer: Buffer.from('hello'),
      mimetype: 'image/jpeg',
      size: 5,
      originalname: 'hero.jpg',
    } as Express.Multer.File;

    it('happy path: puts buffer and inserts READY row', async () => {
      const { service, repo, productsRepo, provider } = makeService();
      productsRepo.findById.mockResolvedValue(createMockProduct({ id: 'p1' }));
      provider.putObject.mockResolvedValue({ publicUrl: 'http://put' });
      repo.create.mockResolvedValue(
        createMockProductImage({ id: 'img-1', status: 'PENDING_UPLOAD' }),
      );
      repo.update.mockResolvedValue(
        createMockProductImage({ id: 'img-1', status: 'READY' }),
      );
      const result = await service.uploadDirect(file, {
        productId: 'p1',
        fileName: 'hero.jpg',
        mimeType: 'image/jpeg',
      });
      expect(result.status).toBe('READY');
      expect(provider.putObject).toHaveBeenCalled();
    });

    it('rejects bad MIME', async () => {
      const { service } = makeService();
      await expect(
        service.uploadDirect(file, {
          productId: 'p1',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('tolerates provider failure', async () => {
      const { service, repo, provider } = makeService();
      repo.findById.mockResolvedValue(createMockProductImage({ id: 'img-1' }));
      repo.remove.mockResolvedValue(undefined);
      provider.delete.mockRejectedValue(new Error('boom'));
      await expect(service.remove('img-1')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'uploads.service.remove_provider_failed',
        }),
      );
    });
  });

  describe('reorder', () => {
    it('updates inside $transaction for same-product items', async () => {
      const { service, repo } = makeService();
      const a = createMockProductImage({ id: 'a', productId: 'p1' });
      const b = createMockProductImage({ id: 'b', productId: 'p1' });
      repo.listByIds.mockResolvedValue([a, b]);
      repo.listByProductForAdmin.mockResolvedValue({
        data: [b, a],
        total: 2,
        page: 1,
        limit: 100,
      });
      const result = await service.reorder({
        productId: 'p1',
        items: [
          { id: 'a', order: 1 },
          { id: 'b', order: 0 },
        ],
      });
      expect(result).toHaveLength(2);
      expect(repo.bulkUpdateOrder).toHaveBeenCalled();
    });

    it('throws BadRequest on cross-product item', async () => {
      const { service, repo } = makeService();
      const a = createMockProductImage({ id: 'a', productId: 'p1' });
      const b = createMockProductImage({ id: 'b', productId: 'p2' });
      repo.listByIds.mockResolvedValue([a, b]);
      await expect(
        service.reorder({
          productId: 'p1',
          items: [
            { id: 'a', order: 0 },
            { id: 'b', order: 1 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupStaleUploads', () => {
    it('partitions confirmed (HEAD ok) vs removed (HEAD null)', async () => {
      const { service, repo, provider } = makeService();
      const a = createMockProductImage({
        id: 'a',
        status: 'PENDING_UPLOAD',
      });
      const b = createMockProductImage({
        id: 'b',
        status: 'PENDING_UPLOAD',
      });
      repo.listStalePendingUploads.mockResolvedValue([a, b]);
      provider.headObject
        .mockResolvedValueOnce({ sizeBytes: 100, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce(null);
      repo.update.mockResolvedValue(
        createMockProductImage({ id: 'a', status: 'READY' }),
      );
      repo.remove.mockResolvedValue(undefined);
      const counts = await service.cleanupStaleUploads();
      expect(counts).toEqual({ confirmed: 1, removed: 1 });
      expect(provider.delete).toHaveBeenCalledWith(b.storageKey);
    });
  });

  describe('listForAdmin', () => {
    it('passes filters + pagination through to the repo', async () => {
      const { service, repo } = makeService();
      repo.listByProductForAdmin.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      await service.listForAdmin(
        { productId: 'p1', status: 'READY' },
        { page: 2, limit: 10 },
      );
      expect(repo.listByProductForAdmin).toHaveBeenCalledWith(
        { productId: 'p1', status: 'READY' },
        { page: 2, limit: 10 },
      );
    });
  });

  describe('findById', () => {
    it('throws NotFound when missing', async () => {
      const { service, repo } = makeService();
      repo.findById.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
