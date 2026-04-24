import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, ExternalLink } from 'lucide-react';
import { Card } from '../ui/Card';
import { SourceRow } from './SourceChip';
import { cn } from '../../lib/cn';
import {
  fmtPct,
  fmtPrice,
  fmtRatioAsPct,
  fmtUsdLarge,
} from '../../lib/format';
import type {
  MarketCompanyData,
  MarketSectionData,
} from '../../types/research';

interface MarketSectionProps {
  data: MarketSectionData;
}

const SERIES_COLORS = [
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EF4444',
];

interface MetricDef {
  key: keyof MarketCompanyData;
  label: string;
  format: (v: unknown) => string;
  higherIsBetter?: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'pe_ratio', label: 'P/E (TTM)', format: (v) => (v == null ? '—' : `${Number(v).toFixed(1)}x`) },
  { key: 'forward_pe', label: 'Forward P/E', format: (v) => (v == null ? '—' : `${Number(v).toFixed(1)}x`) },
  { key: 'eps', label: 'EPS', format: (v) => fmtPrice(v as number | null | undefined) },
  { key: 'revenue', label: 'Revenue (TTM)', format: (v) => fmtUsdLarge(v as number | null | undefined), higherIsBetter: true },
  { key: 'revenue_growth', label: 'Revenue growth', format: (v) => fmtRatioAsPct(v as number | null | undefined), higherIsBetter: true },
  { key: 'gross_margins', label: 'Gross margin', format: (v) => fmtRatioAsPct(v as number | null | undefined), higherIsBetter: true },
  { key: 'market_cap', label: 'Market cap', format: (v) => fmtUsdLarge(v as number | null | undefined) },
  { key: 'week_52_high', label: '52W high', format: (v) => fmtPrice(v as number | null | undefined) },
  { key: 'week_52_low', label: '52W low', format: (v) => fmtPrice(v as number | null | undefined) },
  { key: 'beta', label: 'Beta', format: (v) => (v == null ? '—' : Number(v).toFixed(2)) },
];

function initialsOf(name: string, symbol: string) {
  const source = name || symbol;
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function buildChartData(companies: MarketCompanyData[]) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const c of companies) {
    for (const p of c.history || []) {
      const row = byDate.get(p.date) || { date: p.date };
      row[c.symbol] = p.close;
      byDate.set(p.date, row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function MarketSection({ data }: MarketSectionProps) {
  const companies = useMemo(
    () => Object.values(data.data || {}),
    [data.data],
  );
  const chartData = useMemo(() => buildChartData(companies), [companies]);
  const hasHistory = chartData.length > 0;

  // Winner detection for each metric when we have ≥ 2 companies.
  const winners = useMemo(() => {
    const out: Record<string, string | null> = {};
    if (companies.length < 2) return out;
    for (const metric of METRICS) {
      const values = companies
        .map((c) => ({ symbol: c.symbol, v: c[metric.key] as number | null }))
        .filter((x) => typeof x.v === 'number');
      if (values.length < 2) {
        out[metric.label] = null;
        continue;
      }
      const picked =
        metric.higherIsBetter === false
          ? values.reduce((a, b) => (a.v! < b.v! ? a : b))
          : values.reduce((a, b) => (a.v! > b.v! ? a : b));
      out[metric.label] = picked.symbol;
    }
    return out;
  }, [companies]);

  if (!companies.length) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-slate-100">Market</h3>
        <p className="mt-1 text-xs text-slate-500">No market data returned.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">Market</h3>
        <SourceRow sources={data.sources || ['Yahoo Finance']} />
      </div>

      <div className="flex flex-wrap gap-3">
        {companies.map((c, idx) => {
          const isUp = (c.change_pct ?? 0) >= 0;
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          return (
            <div
              key={c.symbol}
              className="flex flex-1 min-w-[220px] items-center gap-3 rounded-lg border border-border-subtle bg-bg-tertiary p-3"
            >
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
                <p className="font-mono text-base font-semibold text-slate-100">
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

      {hasHistory && (
        <div className="h-[280px] rounded-lg border border-border-subtle bg-bg-primary/40 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                {companies.map((c, idx) => {
                  const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                  return (
                    <linearGradient
                      key={c.symbol}
                      id={`grad-${c.symbol}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid stroke="#2A3550" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                stroke="#64748B"
                fontSize={10}
                tickFormatter={(v) => v.slice(5)}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E2A3E',
                  border: '1px solid #3B4D6B',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#94A3B8' }}
                formatter={(value: number | string, name: string) => [
                  typeof value === 'number' ? `$${value.toFixed(2)}` : value,
                  name,
                ]}
              />
              {companies.map((c, idx) => (
                <Area
                  key={c.symbol}
                  type="monotone"
                  dataKey={c.symbol}
                  stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#grad-${c.symbol})`}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="min-w-full text-xs">
          <thead className="bg-bg-tertiary text-slate-500">
            <tr>
              <th className="p-2 text-left font-medium">Metric</th>
              {companies.map((c) => (
                <th key={c.symbol} className="p-2 text-right font-mono text-slate-300">
                  {c.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr key={metric.label} className="border-t border-border-subtle">
                <td className="p-2 text-slate-400">{metric.label}</td>
                {companies.map((c) => {
                  const winner = winners[metric.label] === c.symbol;
                  return (
                    <td
                      key={c.symbol + metric.label}
                      className={cn(
                        'p-2 text-right font-mono text-slate-200',
                        winner && 'bg-gain/10 text-gain',
                      )}
                    >
                      {metric.format(c[metric.key])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.narrative && (
        <p className="text-xs leading-relaxed text-slate-300">{data.narrative}</p>
      )}

      {companies[0]?.source_url && (
        <a
          className="inline-flex w-fit items-center gap-1 text-[11px] text-brand-glow hover:underline"
          href={companies[0].source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Yahoo Finance <ExternalLink size={10} />
        </a>
      )}

      {Array.isArray(data.key_insights) && data.key_insights.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-slate-300">
          {data.key_insights.map((k, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand-glow">•</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
