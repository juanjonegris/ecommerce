'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import type { OrderStatus } from '@repo/types';

import { updateOrderStatusAction } from '@/app/actions/admin/orders';
import { Button } from '@/components/ui/button';

interface StatusButtonsProps {
  orderId: string;
  currentStatus: OrderStatus;
}

// Client-side mirror of the backend's state machine. Backend re-validates,
// so this is purely UX; an admin can never push an illegal transition through.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function StatusButtons({ orderId, currentStatus }: StatusButtonsProps): React.ReactElement {
  const t = useTranslations('admin.orders');
  const tCommon = useTranslations('admin.common');
  const [pending, startTransition] = useTransition();
  const allowed = TRANSITIONS[currentStatus];

  const onTransition = (target: OrderStatus): void => {
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, target);
      if (result.ok) {
        toast.success(t(`status.${target}`));
      } else {
        toast.error(result.error ?? tCommon('error'));
      }
    });
  };

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="admin-orders-terminal">
        {t(`status.${currentStatus}`)}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="admin-orders-status-buttons">
      {allowed.map((target) => (
        <Button
          key={target}
          onClick={() => {
            onTransition(target);
          }}
          disabled={pending}
          variant={target === 'CANCELLED' ? 'destructive' : 'default'}
          data-testid={`admin-orders-status-${target}`}
        >
          {t(`status.${target}`)}
        </Button>
      ))}
    </div>
  );
}
