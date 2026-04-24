import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, leftIcon, rightIcon, className, containerClassName, id, ...rest },
    ref,
  ) => {
    const inputId = id || rest.name;
    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-slate-400"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-lg border bg-bg-tertiary px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-brand-blue/60',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error
                ? 'border-loss focus:ring-loss/40'
                : 'border-border-default hover:border-border-strong',
              className,
            )}
            {...rest}
          />
          {rightIcon && (
            <span className="absolute inset-y-0 right-3 flex items-center text-slate-500">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <span className="text-xs text-loss">{error}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
