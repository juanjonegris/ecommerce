import { Badge } from '@/components/ui/badge';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

// Single map covers OrderStatus / NewsletterStatus / NewsletterSyncState /
// PaymentStatus / ProductImageStatus / ConversationStatus — values are
// distinct across enums so collision is fine.
const VARIANT_MAP: Record<string, Variant> = {
  // OrderStatus
  PENDING: 'secondary',
  CONFIRMED: 'default',
  SHIPPED: 'default',
  DELIVERED: 'outline',
  CANCELLED: 'destructive',
  // NewsletterStatus / NewsletterSyncState (PENDING reused above)
  UNSUBSCRIBED: 'destructive',
  SYNCED: 'default',
  PENDING_SYNC: 'secondary',
  FAILED: 'destructive',
  NOT_APPLICABLE: 'outline',
  // PaymentStatus
  REQUIRES_PAYMENT_METHOD: 'secondary',
  PROCESSING: 'secondary',
  SUCCEEDED: 'default',
  REFUNDED: 'outline',
  // ProductImageStatus
  PENDING_UPLOAD: 'secondary',
  READY: 'default',
  // ConversationStatus
  OPEN: 'default',
  CLOSED: 'outline',
};

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps): React.ReactElement {
  const variant = VARIANT_MAP[status] ?? 'outline';
  return (
    <Badge variant={variant} data-testid={`admin-status-${status}`}>
      {label ?? status}
    </Badge>
  );
}
