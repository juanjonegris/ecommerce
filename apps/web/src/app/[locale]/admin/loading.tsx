import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading(): React.ReactElement {
  return (
    <div className="p-8 flex flex-col gap-4" data-testid="admin-loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
