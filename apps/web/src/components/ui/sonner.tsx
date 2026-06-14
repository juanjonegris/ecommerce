'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Stripped version of the shadcn-generated sonner toaster — drops the
 * `next-themes` dependency (we don't ship a theme switcher) and the
 * exactOptionalPropertyTypes-incompatible spread.
 */
export function Toaster(props: ToasterProps): React.ReactElement {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
