import { motion } from 'framer-motion';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';
import type { Sentiment } from '../../types';

interface WatchlistCardProps {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  history: number[];
  sentiment?: Sentiment;
  loading?: boolean;
  onRemove?: () => void;
  onOpen?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  draggable?: boolean;
}

const sentimentMap: Record<Sentiment, { color: string; label: string }> = {
  positive: { color: 'bg-gain', label: 'Positive sentiment' },
  neutral: { color: 'bg-neutral', label: 'Neutral sentiment' },
  negative: { color: 'bg-loss', label: 'Negative sentiment' },
};

function formatPrice(v: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(v: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function WatchlistCardSkeleton() {
  return (
    <div className="flex h-52 flex-col justify-between rounded-xl border border-border-subtle bg-bg-secondary p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 animate-pulse rounded bg-bg-tertiary" />
          <div className="h-3 w-14 animate-pulse rounded bg-bg-tertiary" />
        </div>
      </div>
      <div className="h-20 animate-pulse rounded bg-bg-tertiary" />
      <div className="flex items-end justify-between">
        <div className="h-6 w-24 animate-pulse rounded bg-bg-tertiary" />
        <div className="h-5 w-16 animate-pulse rounded bg-bg-tertiary" />
      </div>
    </div>
  );
}

export function WatchlistCard({
  symbol,
  name,
  price,
  change,
  changePct,
  history,
  sentiment = 'neutral',
  loading,
  onRemove,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  draggable,
}: WatchlistCardProps) {
  if (loading) return <WatchlistCardSkeleton />;

  const isUp = (changePct ?? 0) >= 0;
  const lineColor = isUp ? '#10B981' : '#EF4444';
  const data = history.map((y, i) => ({ i, y }));
  const sentimentInfo = sentimentMap[sentiment];

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col justify-between gap-3 rounded-xl border border-border-subtle bg-bg-secondary p-4 transition-colors hover:border-border-default"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">
            {name || symbol}
          </p>
          <Badge className="mt-1 font-mono text-[11px]" variant="default">
            {symbol}
          </Badge>
        </div>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${symbol} from watchlist`}
            className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-loss/10 hover:text-loss group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="h-20">
        {data.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
              <Line
                type="monotone"
                dataKey="y"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
            No recent price data
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-xl font-semibold text-slate-100">
            {formatPrice(price)}
          </p>
          {change != null && (
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs font-medium',
              isUp
                ? 'border-gain/30 bg-gain-subtle text-gain'
                : 'border-loss/30 bg-loss-subtle text-loss',
            )}
          >
            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {formatPct(changePct)}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span
              aria-label={sentimentInfo.label}
              title={sentimentInfo.label}
              className={cn('h-2 w-2 rounded-full', sentimentInfo.color)}
            />
            <span className="font-medium text-brand-glow group-hover:underline">
              Deep Dive →
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
