import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { colorForIdx } from '../../lib/compareColors';
import type { MarketCompanyData } from '../../types/research';

interface ComparePricePerformanceProps {
  companies: MarketCompanyData[];
}

const PERIODS = ['1W', '1M', '3M', '6M', '1Y'] as const;
type Period = (typeof PERIODS)[number];

function sliceHistory(
  rows: NonNullable<MarketCompanyData['history']>,
  period: Period,
) {
  if (!rows.length) return [];
  const days = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[period];
  return rows.slice(Math.max(0, rows.length - days));
}

export function ComparePricePerformance({
  companies,
}: ComparePricePerformanceProps) {
  const [period, setPeriod] = useState<Period>('1M');

  const chartData = useMemo(() => {
    // Normalize each series to % change from the first close in the period.
    const byDate = new Map<string, Record<string, number | string>>();
    companies.forEach((c) => {
      const history = sliceHistory(c.history || [], period);
      const baseline = history[0]?.close;
      if (!baseline) return;
      history.forEach((p) => {
        const row = byDate.get(p.date) || { date: p.date };
        row[c.symbol] = ((p.close - baseline) / baseline) * 100;
        row[`__price_${c.symbol}`] = p.close;
        byDate.set(p.date, row);
      });
    });
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [companies, period]);

  const hasData = chartData.length >= 2;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Price Performance
          </h3>
          <p className="text-[11px] text-slate-500">
            % change from start of period
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border-subtle">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors',
                period === p
                  ? 'bg-brand-blue text-white'
                  : 'bg-bg-tertiary text-slate-400 hover:text-slate-100',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#2A3550" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                stroke="#64748B"
                fontSize={10}
                tickFormatter={(v: string) => v.slice(5)}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}%`}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E2A3E',
                  border: '1px solid #3B4D6B',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: '#94A3B8' }}
                formatter={(value: number | string, name: string, item) => {
                  if (String(name).startsWith('__price_')) return [null, null];
                  const priceKey = `__price_${name}`;
                  const row = (item as { payload?: Record<string, number> }).payload || {};
                  const price = row[priceKey];
                  const pct = typeof value === 'number' ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : String(value);
                  return price
                    ? [`${pct} ($${price.toFixed(2)})`, name]
                    : [pct, name];
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
              />
              {companies.map((c, idx) => (
                <Line
                  key={c.symbol}
                  type="monotone"
                  dataKey={c.symbol}
                  stroke={colorForIdx(idx)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-subtle text-[11px] text-slate-500">
            Not enough history to plot this period.
          </div>
        )}
      </div>
    </Card>
  );
}
