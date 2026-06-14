'use client';

import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingCart,
  Tag,
  Mail,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';

import type { User } from '@repo/types';

import { logoutAction } from '@/app/actions/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { brand } from '@/config/brand';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/admin', icon: LayoutDashboard },
  { key: 'products', href: '/admin/products', icon: Package },
  { key: 'categories', href: '/admin/categories', icon: FolderTree },
  { key: 'orders', href: '/admin/orders', icon: ShoppingCart },
  { key: 'discounts', href: '/admin/discounts', icon: Tag },
  { key: 'newsletter', href: '/admin/newsletter', icon: Mail },
  { key: 'chat', href: '/admin/chat', icon: MessageSquare },
  { key: 'settings', href: '/admin/settings', icon: Settings },
];

interface AdminShellProps {
  user: User;
  locale: string;
  children: ReactNode;
}

function NavLink({
  item,
  active,
  label,
}: {
  item: NavItem;
  active: boolean;
  label: string;
}): React.ReactElement {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-testid={`admin-nav-${item.key}`}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function UserChip({ user, locale }: { user: User; locale: string }): React.ReactElement {
  const t = useTranslations('admin.nav');
  const [pending, startTransition] = useTransition();
  const initials = user.email.slice(0, 2).toUpperCase();

  const onLogout = (): void => {
    startTransition(async () => {
      await logoutAction(locale);
    });
  };

  return (
    <div className="flex items-center gap-3" data-testid="admin-user-chip">
      <Avatar className="size-8">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" data-testid="admin-user-email">
          {user.email}
        </p>
        <p className="text-xs text-muted-foreground">{user.role}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLogout}
        disabled={pending}
        title={t('logout')}
        data-testid="admin-logout"
      >
        <LogOut className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function AdminShell({ user, locale, children }: AdminShellProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('admin.nav');

  const isActive = (href: string): boolean =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen" data-testid="admin-shell">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4">
          <p className="text-lg font-bold" data-testid="admin-brand-name">
            {brand.name}
          </p>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <nav className="p-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                active={isActive(item.href)}
                label={t(item.key)}
              />
            ))}
          </nav>
        </ScrollArea>
        <Separator />
        <div className="p-3">
          <UserChip user={user} locale={locale} />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
