import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const roundedMap = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export function Skeleton({
  width,
  height,
  className,
  rounded = 'md',
}: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'klypup-shimmer block bg-bg-tertiary',
        roundedMap[rounded],
        className,
      )}
    />
  );
}

interface SkeletonBlockProps {
  lines?: number;
  className?: string;
}

export function SkeletonLines({ lines = 3, className }: SkeletonBlockProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={10}
          width={`${80 - i * 12}%`}
        />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <span className="klypup-shimmer h-6 w-40 rounded-md bg-bg-tertiary" />
        <span className="klypup-shimmer h-3 w-24 rounded-md bg-bg-tertiary" />
      </div>
    </div>
  );
}
