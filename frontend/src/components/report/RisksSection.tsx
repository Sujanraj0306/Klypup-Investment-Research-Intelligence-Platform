import { Shield, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import type { RiskItem, RisksSectionData } from '../../types/research';

interface RisksSectionProps {
  data: RisksSectionData | { risks?: RiskItem[] };
}

const severityStyle: Record<
  RiskItem['severity'],
  { text: string; bg: string; bar: string; label: string }
> = {
  high: {
    text: 'text-loss',
    bg: 'bg-loss-subtle',
    bar: 'bg-loss',
    label: 'High',
  },
  medium: {
    text: 'text-neutral',
    bg: 'bg-neutral-subtle',
    bar: 'bg-neutral',
    label: 'Medium',
  },
  low: {
    text: 'text-gain',
    bg: 'bg-gain-subtle',
    bar: 'bg-gain',
    label: 'Low',
  },
};

function normalize(input: RisksSectionProps['data']): RiskItem[] {
  if (Array.isArray(input)) return input;
  return input?.risks || [];
}

export function RisksSection({ data }: RisksSectionProps) {
  const risks = normalize(data);
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-loss/10 text-loss">
          <Shield size={14} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Risk Assessment</h3>
          <p className="text-[11px] text-slate-500">
            Rated high/medium/low severity based on gathered evidence.
          </p>
        </div>
      </div>

      {risks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-subtle p-4 text-center text-xs text-slate-500">
          No risks identified.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {risks.map((r, i) => {
            const style = severityStyle[r.severity] || severityStyle.medium;
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-border-subtle bg-bg-tertiary p-3"
              >
                <span
                  className={cn(
                    'absolute left-0 right-0 top-0 h-0.5',
                    style.bar,
                  )}
                />
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      style.bg,
                      style.text,
                      'border-current/30',
                    )}
                  >
                    <AlertTriangle size={10} /> {style.label}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-100">{r.risk}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {r.detail}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-600">
        Risk assessment based on public data as of {today}. Not financial advice.
      </p>
    </Card>
  );
}
