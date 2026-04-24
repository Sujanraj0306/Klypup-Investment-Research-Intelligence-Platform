import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { colorForIdx } from '../../lib/compareColors';
import { fmtPct, fmtPrice } from '../../lib/format';
import type { MarketCompanyData } from '../../types/research';

interface CompanyHeaderRowProps {
  companies: MarketCompanyData[];
}

function initialsOf(name: string, symbol: string) {
  const source = name || symbol;
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function CompanyHeaderRow({ companies }: CompanyHeaderRowProps) {
  if (!companies.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {companies.map((c, idx) => {
        const isUp = (c.change_pct ?? 0) >= 0;
        const color = colorForIdx(idx);
        return (
          <div
            key={c.symbol}
            className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border-subtle bg-bg-tertiary p-3"
          >
            <span
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: color }}
            />
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {initialsOf(c.name, c.symbol)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {c.name}
              </p>
              <p className="font-mono text-[11px] text-slate-500">
                {c.symbol} · {c.sector || '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-slate-100">
                {fmtPrice(c.price)}
              </p>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-mono text-[11px]',
                  isUp ? 'text-gain' : 'text-loss',
                )}
              >
                {isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                {fmtPct(c.change_pct)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
