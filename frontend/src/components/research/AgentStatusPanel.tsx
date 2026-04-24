import { Check, CircleDot } from 'lucide-react';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/cn';
import type { AgentStep } from '../../types/research';

interface AgentStatusPanelProps {
  steps: AgentStep[];
  progress: number;
  status: 'idle' | 'streaming' | 'complete' | 'error';
  toolsUsed: string[];
}

function fmtDuration(ms?: number) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentStatusPanel({
  steps,
  progress,
  status,
  toolsUsed,
}: AgentStatusPanelProps) {
  const isComplete = status === 'complete';
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">
          Research Progress
        </h3>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isComplete ? 'bg-gain' : 'bg-brand-blue',
            )}
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {status === 'streaming'
            ? `${progress}% · running`
            : isComplete
              ? '100% · complete'
              : status === 'error'
                ? 'Error'
                : 'Idle'}
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const finished = step.completedAt !== undefined || (isComplete && i < steps.length);
          const active = !finished && i === steps.length - 1;
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                {finished ? (
                  <Check size={14} className="text-gain" />
                ) : active ? (
                  <Spinner size="sm" />
                ) : (
                  <CircleDot size={14} className="text-brand-glow" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-200">{step.step}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  {step.tool && (
                    <span className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-[10px] text-brand-glow">
                      {step.tool}
                    </span>
                  )}
                  {finished && step.durationMs ? (
                    <span>{fmtDuration(step.durationMs)}</span>
                  ) : active ? (
                    <span className="italic">running…</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {toolsUsed.length > 0 && (
        <div className="rounded-md border border-border-subtle bg-bg-tertiary p-2 text-[11px] text-slate-500">
          Tools used:{' '}
          <span className="font-mono text-slate-300">
            {Array.from(new Set(toolsUsed)).join(', ')}
          </span>
        </div>
      )}

      <div className="mt-auto border-t border-border-subtle pt-2 text-[11px] text-slate-500">
        Powered by Gemini 2.5 Flash + direct tool dispatch
      </div>
    </Card>
  );
}
