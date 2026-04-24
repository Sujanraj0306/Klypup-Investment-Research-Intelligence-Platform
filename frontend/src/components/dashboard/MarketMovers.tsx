import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { useMarketMovers } from '../../hooks/useMarketData';
import { cn } from '../../lib/cn';
import type { MoverRow } from '../../types';

function formatPct(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatPrice(v: number) {
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function MoverRowView({ row, isGainer }: { row: MoverRow; isGainer: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-bg-tertiary">
      <div className="min-w-0">
        <p className="font-mono text-xs font-semibold text-slate-100">
          {row.symbol}
        </p>
        {row.name && (
          <p className="truncate text-[11px] text-slate-500">{row.name}</p>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span className="font-mono text-xs text-slate-300">
          {formatPrice(row.price)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-mono text-[11px]',
            isGainer ? 'text-gain' : 'text-loss',
          )}
        >
          {isGainer ? (
            <ArrowUpRight size={10} />
          ) : (
            <ArrowDownRight size={10} />
          )}
          {formatPct(row.changePct)}
        </span>
      </div>
    </div>
  );
}

export function MarketMovers() {
  const { data, isLoading, isError } = useMarketMovers();

  return (
    <Card className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Market Movers</h3>
        <TrendingUp size={14} className="text-slate-500" />
      </div>
      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="md" />
        </div>
      )}
      {isError && (
        <div className="text-sm text-loss">Unable to load market movers.</div>
      )}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-gain">
              Gainers
            </p>
            <div className="flex flex-col gap-0.5">
              {data.gainers.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-500">—</p>
              )}
              {data.gainers.map((r) => (
                <MoverRowView key={r.symbol} row={r} isGainer />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-loss">
              Losers
            </p>
            <div className="flex flex-col gap-0.5">
              {data.losers.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-500">—</p>
              )}
              {data.losers.map((r) => (
                <MoverRowView key={r.symbol} row={r} isGainer={false} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
