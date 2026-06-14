'use client';

import { Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { ProductImage } from '@repo/types';

import { deleteImageAction, reorderImagesAction } from '@/app/actions/admin/products';
import { confirmImageAction, presignImageAction } from '@/app/actions/admin/uploads';
import { Button } from '@/components/ui/button';

interface ImageManagerProps {
  productId: string;
  images: ProductImage[];
}

export function ImageManager({
  productId,
  images: initialImages,
}: ImageManagerProps): React.ReactElement {
  const t = useTranslations('admin.products');
  const tCommon = useTranslations('admin.common');
  const [images, setImages] = useState<ProductImage[]>(initialImages);
  const [pending, startTransition] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUploadClick = (): void => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const presign = await presignImageAction({
        productId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.requiredHeaders,
        body: file,
      });
      if (!putRes.ok && presign.mode !== 'stub') {
        throw new Error(`PUT failed: ${String(putRes.status)}`);
      }

      await confirmImageAction(presign.imageId);
      toast.success(t('uploadImage'));
      // Optimistically append; the next page revalidation will sync.
      setImages((prev) => [
        ...prev,
        {
          id: presign.imageId,
          productId,
          url: presign.publicUrl,
          order: prev.length,
          storageKey: '',
          mimeType: file.type,
          sizeBytes: file.size,
          width: null,
          height: null,
          status: 'READY',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tCommon('error'));
    }
  };

  const onDeleteImage = (imageId: string): void => {
    startTransition(async () => {
      try {
        await deleteImageAction(imageId);
        setImages((prev) => prev.filter((i) => i.id !== imageId));
        toast.success(tCommon('delete'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tCommon('error'));
      }
    });
  };

  const onDragStart = (idx: number): void => {
    setDragIndex(idx);
  };

  const onDragOver = (e: React.DragEvent<HTMLLIElement>): void => {
    e.preventDefault();
  };

  const onDrop = (targetIdx: number): void => {
    if (dragIndex === null || dragIndex === targetIdx) {
      setDragIndex(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(targetIdx, 0, moved);
    const reordered = next.map((img, i) => ({ ...img, order: i }));
    setImages(reordered);
    setDragIndex(null);
    startTransition(async () => {
      try {
        await reorderImagesAction(
          productId,
          reordered.map((img) => ({ id: img.id, order: img.order })),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tCommon('error'));
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="admin-image-manager">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('reorderHint')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUploadClick}
          disabled={pending}
          data-testid="admin-image-upload-button"
        >
          <Upload className="size-4 mr-2" aria-hidden />
          {t('uploadImage')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(e) => {
            void onFileChange(e);
          }}
          className="hidden"
          data-testid="admin-image-file-input"
        />
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{tCommon('empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <li
              key={img.id}
              draggable
              onDragStart={() => {
                onDragStart(idx);
              }}
              onDragOver={onDragOver}
              onDrop={() => {
                onDrop(idx);
              }}
              className="relative group border rounded-md overflow-hidden bg-card cursor-move"
              data-testid={`admin-image-${img.id}`}
            >
              {/* Using <img> rather than next/image because the URL is
                  user-supplied and the storefront sets up its own next/image
                  optimization config separately. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-32 object-cover" loading="lazy" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => {
                  onDeleteImage(img.id);
                }}
                disabled={pending}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`admin-image-delete-${img.id}`}
                title={t('deleteImage')}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
