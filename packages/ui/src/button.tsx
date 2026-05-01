'use client';

import type { ReactElement, ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  className?: string;
  appName: string;
}

export const Button = ({ children, className, appName }: ButtonProps): ReactElement => {
  return (
    <button
      className={className}
      onClick={() => {
        alert(`Hello from your ${appName} app!`);
      }}
    >
      {children}
    </button>
  );
};
