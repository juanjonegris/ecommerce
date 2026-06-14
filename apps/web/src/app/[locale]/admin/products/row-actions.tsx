'use client';

import { Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { deleteProductAction } from '@/app/actions/admin/products';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/navigation';

interface ProductRowActionsProps {
  productId: string;
  productSlug: string;
}

export function ProductRowActions({
  productId,
  productSlug,
}: ProductRowActionsProps): React.ReactElement {
  const t = useTranslations('admin.products');
  const tCommon = useTranslations('admin.common');
  const [pending, startTransition] = useTransition();

  const onDelete = (): Promise<void> =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        await deleteProductAction(productId);
        resolve();
      });
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            data-testid={`admin-products-actions-${productSlug}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link
              href={`/admin/products/${productSlug}`}
              data-testid={`admin-products-edit-${productSlug}`}
            >
              <Edit className="size-4 mr-2" aria-hidden />
              {tCommon('edit')}
            </Link>
          }
        />
        <ConfirmDialog
          title={tCommon('delete')}
          description={t('deleteConfirm')}
          action={onDelete}
          testid={`admin-products-delete-trigger-${productSlug}`}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
              data-testid={`admin-products-delete-${productSlug}`}
              className="text-destructive"
            >
              <Trash2 className="size-4 mr-2" aria-hidden />
              {tCommon('delete')}
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
