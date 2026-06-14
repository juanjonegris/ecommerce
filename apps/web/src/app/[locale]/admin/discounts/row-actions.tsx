'use client';

import { Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { deleteDiscountAction } from '@/app/actions/admin/discounts';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/navigation';

interface DiscountRowActionsProps {
  discountId: string;
  discountCode: string;
}

export function DiscountRowActions({
  discountId,
  discountCode,
}: DiscountRowActionsProps): React.ReactElement {
  const tCommon = useTranslations('admin.common');
  const [pending, startTransition] = useTransition();

  const onDelete = (): Promise<void> =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        await deleteDiscountAction(discountId);
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
            data-testid={`admin-discounts-actions-${discountCode}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link
              href={`/admin/discounts/${discountId}`}
              data-testid={`admin-discounts-edit-${discountCode}`}
            >
              <Edit className="size-4 mr-2" aria-hidden />
              {tCommon('edit')}
            </Link>
          }
        />
        <ConfirmDialog
          title={tCommon('delete')}
          action={onDelete}
          testid={`admin-discounts-delete-trigger-${discountCode}`}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
              data-testid={`admin-discounts-delete-${discountCode}`}
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
