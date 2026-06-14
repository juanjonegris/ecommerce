import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

interface AdminBreadcrumbsProps {
  segments: { key: string; href?: string; label?: string }[];
}

/**
 * Server Component breadcrumbs. Each segment is either a translated nav key
 * ({ key: 'products' }) or an arbitrary label ({ label: 'Edit product' }).
 * The final segment never gets a href.
 */
export async function AdminBreadcrumbs({
  segments,
}: AdminBreadcrumbsProps): Promise<React.ReactElement> {
  const t = await getTranslations('admin.nav');
  return (
    <nav
      aria-label="breadcrumbs"
      className="flex items-center gap-2 text-sm text-muted-foreground mb-4"
      data-testid="admin-breadcrumbs"
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        const text = seg.label ?? t(seg.key);
        return (
          <span key={`${seg.key}-${String(idx)}`} className="flex items-center gap-2">
            {seg.href && !isLast ? (
              <Link
                href={seg.href}
                className="hover:text-foreground"
                data-testid={`admin-breadcrumb-${seg.key}`}
              >
                {text}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-foreground' : ''}
                data-testid={`admin-breadcrumb-${seg.key}`}
              >
                {text}
              </span>
            )}
            {!isLast ? <ChevronRight className="size-4" aria-hidden /> : null}
          </span>
        );
      })}
    </nav>
  );
}
