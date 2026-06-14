'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  action: () => Promise<unknown>;
  testid?: string;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
  testid,
}: ConfirmDialogProps): React.ReactElement {
  const t = useTranslations('admin.common');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = (): void => {
    startTransition(async () => {
      await action();
      setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={trigger as React.ReactElement}
        data-testid={testid ?? 'admin-confirm-trigger'}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            data-testid="admin-confirm-action"
          >
            {pending ? t('loading') : t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
