import { BadRequestException } from '@nestjs/common';

import { createMockProductImage } from '../../../test/factories/product-image.factory';

import { UploadsController } from './uploads.controller';
import type { UploadsService } from './uploads.service';

function makeService(): jest.Mocked<
  Pick<
    UploadsService,
    | 'presign'
    | 'confirm'
    | 'uploadDirect'
    | 'listForAdmin'
    | 'findById'
    | 'remove'
    | 'reorder'
  >
> {
  return {
    presign: jest.fn(),
    confirm: jest.fn(),
    uploadDirect: jest.fn(),
    listForAdmin: jest.fn(),
    findById: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };
}

describe('UploadsController', () => {
  let service: ReturnType<typeof makeService>;
  let controller: UploadsController;

  beforeEach(() => {
    service = makeService();
    controller = new UploadsController(service as unknown as UploadsService);
    jest.clearAllMocks();
  });

  it('POST /presign returns the expected shape', async () => {
    service.presign.mockResolvedValue({
      imageId: 'img-1',
      uploadUrl: 'https://signed/x',
      requiredHeaders: { 'Content-Type': 'image/jpeg' },
      publicUrl: 'https://public/x',
      expiresAt: new Date('2026-06-13T12:05:00Z'),
      mode: 's3',
    });
    const result = await controller.presign({
      productId: 'p1',
      fileName: 'hero.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
    });
    expect(result).toEqual({
      imageId: 'img-1',
      uploadUrl: 'https://signed/x',
      requiredHeaders: { 'Content-Type': 'image/jpeg' },
      publicUrl: 'https://public/x',
      expiresAt: '2026-06-13T12:05:00.000Z',
      mode: 's3',
    });
  });

  it('POST /:id/confirm delegates to service.confirm', async () => {
    service.confirm.mockResolvedValue(
      createMockProductImage({ id: 'img-1', status: 'READY' }),
    );
    const result = await controller.confirm('img-1');
    expect(service.confirm).toHaveBeenCalledWith('img-1');
    expect(result.id).toBe('img-1');
  });

  it('POST / (multipart) requires file field', async () => {
    await expect(controller.uploadDirect(undefined, '{}')).rejects.toThrow(
      /file field is required/,
    );
  });

  it('POST / (multipart) rejects malformed metadata JSON', async () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'image/jpeg',
      size: 1,
      originalname: 'x.jpg',
    } as Express.Multer.File;
    await expect(controller.uploadDirect(file, 'not-json')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('POST / (multipart) calls service.uploadDirect with parsed metadata', async () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'image/jpeg',
      size: 1,
      originalname: 'x.jpg',
    } as Express.Multer.File;
    service.uploadDirect.mockResolvedValue(
      createMockProductImage({ id: 'img-1', status: 'READY' }),
    );
    const metadata = JSON.stringify({
      productId: 'p1',
      fileName: 'hero.jpg',
      mimeType: 'image/jpeg',
    });
    await controller.uploadDirect(file, metadata);
    expect(service.uploadDirect).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ productId: 'p1', mimeType: 'image/jpeg' }),
    );
  });

  it('GET / response data does NOT contain storageKey', async () => {
    service.listForAdmin.mockResolvedValue({
      data: [
        createMockProductImage({
          id: 'img-1',
          storageKey: 'should-be-stripped',
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    const result = await controller.findAll({});
    const first = result.data[0] as unknown as Record<string, unknown>;
    expect('storageKey' in first).toBe(false);
  });

  it('DELETE /:id delegates to service.remove', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove('img-1');
    expect(service.remove).toHaveBeenCalledWith('img-1');
  });

  it('POST /reorder delegates to service.reorder', async () => {
    service.reorder.mockResolvedValue([
      createMockProductImage({ id: 'a' }),
      createMockProductImage({ id: 'b' }),
    ]);
    const result = await controller.reorder({
      productId: 'p1',
      items: [
        { id: 'a', order: 0 },
        { id: 'b', order: 1 },
      ],
    });
    expect(service.reorder).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});
