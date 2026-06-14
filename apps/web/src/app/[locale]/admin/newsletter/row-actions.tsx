'use client';

import { MoreHorizontal, RefreshCw, Trash2, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  deleteSubscriberAction,
  forceResyncAction,
  forceUnsubscribeAction,
  type NewsletterActionResult,
} from '@/app/actions/admin/newsletter';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NewsletterRowActionsProps {
  subscriberId: string;
  email: string;
}

export function NewsletterRowActions({
  subscriberId,
  email,
}: NewsletterRowActionsProps): React.ReactElement {
  const t = useTranslations('admin.newsletter');
  const tCommon = useTranslations('admin.common');
  const [pending, startTransition] = useTransition();

  const handleResult = (result: NewsletterActionResult, successLabel: string): void => {
    if (result.ok) {
      toast.success(successLabel);
      return;
    }
    if (result.errorCode === 'CONFLICT') {
      toast.error(t('syncMismatch'));
    } else {
      toast.error(result.error ?? tCommon('error'));
    }
  };

  const onResync = (): void => {
    startTransition(async () => {
      const result = await forceResyncAction(subscriberId);
      handleResult(result, t('resync'));
    });
  };

  const onUnsubscribe = (): void => {
    startTransition(async () => {
      const result = await forceUnsubscribeAction(subscriberId);
      handleResult(result, t('forceUnsubscribe'));
    });
  };

  const onDelete = (): Promise<void> =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await deleteSubscriberAction(subscriberId);
        handleResult(result, t('deleteGdpr'));
        resolve();
      });
    });

  // emailKey: per-row testid suffix. Email may contain '@' and '.' which
  // are fine in CSS selectors / Playwright but trickier in some matchers
  // — replace with '-' for safety.
  const emailKey = email.replace(/[^a-zA-Z0-9]/g, '-');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            data-testid={`admin-newsletter-actions-${emailKey}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onResync} data-testid={`admin-newsletter-resync-${emailKey}`}>
          <RefreshCw className="size-4 mr-2" aria-hidden />
          {t('resync')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onUnsubscribe}
          data-testid={`admin-newsletter-unsubscribe-${emailKey}`}
        >
          <UserX className="size-4 mr-2" aria-hidden />
          {t('forceUnsubscribe')}
        </DropdownMenuItem>
        <ConfirmDialog
          title={t('deleteGdpr')}
          description={t('deleteConfirm')}
          action={onDelete}
          testid={`admin-newsletter-delete-trigger-${emailKey}`}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
              data-testid={`admin-newsletter-delete-${emailKey}`}
              className="text-destructive"
            >
              <Trash2 className="size-4 mr-2" aria-hidden />
              {t('deleteGdpr')}
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
