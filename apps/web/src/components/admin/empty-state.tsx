import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): React.ReactElement {
  return (
    <Card data-testid="admin-empty-state">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-lg font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {action ?? null}
      </CardContent>
    </Card>
  );
}
