import { getTranslations } from 'next-intl/server';

import { EmptyState } from '@/components/admin/empty-state';

export default async function AdminNotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('admin.common');
  return (
    <div className="p-8" data-testid="admin-not-found">
      <EmptyState title={t('empty')} />
    </div>
  );
}
