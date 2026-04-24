import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onClick?: () => void;
}

export function Card({ className, children, onClick, ...rest }: CardProps) {
  const hoverable = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      role={hoverable ? 'button' : undefined}
      tabIndex={hoverable ? 0 : undefined}
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-secondary p-4',
        hoverable &&
          'cursor-pointer transition-colors hover:border-border-default hover:bg-bg-tertiary',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
