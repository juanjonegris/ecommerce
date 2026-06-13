import type { ProductImage, ProductImageStatus } from '@repo/types';

/** Internal entity used by service + repository. The outbound response DTO
 *  strips `storageKey` before serializing to admins. */
export class ProductImageEntity implements ProductImage {
  id!: string;
  productId!: string;
  url!: string;
  order!: number;
  storageKey!: string;
  mimeType!: string;
  sizeBytes!: number;
  width!: number | null;
  height!: number | null;
  status!: ProductImageStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
