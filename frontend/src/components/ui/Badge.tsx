import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeVariant = 'default' | 'gain' | 'loss' | 'neutral' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-tertiary text-slate-300 border-border-subtle',
  gain: 'bg-gain-subtle text-gain border-gain/30',
  loss: 'bg-loss-subtle text-loss border-loss/30',
  neutral: 'bg-neutral-subtle text-neutral border-neutral/30',
  info: 'bg-brand-blue/10 text-brand-glow border-brand-blue/30',
};

export function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
