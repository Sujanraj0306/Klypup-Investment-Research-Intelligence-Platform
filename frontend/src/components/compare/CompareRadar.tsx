import { useMemo } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card } from '../ui/Card';
import { colorForIdx } from '../../lib/compareColors';
import type { MarketCompanyData, NewsSentimentEntry } from '../../types/research';

interface CompareRadarProps {
  companies: MarketCompanyData[];
  sentiment: Record<string, NewsSentimentEntry & { score_0_100?: number | null }>;
}

type RadarKey =
  | 'Revenue Growth'
  | 'Gross Margin'
  | 'Valuation Attractiveness'
  | 'Earnings Quality'
  | 'Price Momentum'
  | 'News Sentiment';

function normalize(
  values: Array<{ symbol: string; v: number | null }>,
  invert = false,
): Record<string, number> {
  const valid = values.filter((x) => typeof x.v === 'number') as Array<{
    symbol: string;
    v: number;
  }>;
  if (valid.length === 0) return {};
  const nums = valid.map((v) => v.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const out: Record<string, number> = {};
  for (const { symbol, v } of valid) {
    if (max === min) {
      out[symbol] = 50;
    } else {
      const n = ((v - min) / (max - min)) * 100;
      out[symbol] = invert ? 100 - n : n;
    }
  }
  return out;
}

export function CompareRadar({ companies, sentiment }: CompareRadarProps) {
  const rows = useMemo(() => {
    const symbols = companies.map((c) => c.symbol);

    const revenueGrowth = normalize(
      companies.map((c) => ({
        symbol: c.symbol,
        v: typeof c.revenue_growth === 'number' ? c.revenue_growth : null,
      })),
    );
    const grossMargin = normalize(
      companies.map((c) => ({
        symbol: c.symbol,
        v: typeof c.gross_margins === 'number' ? c.gross_margins : null,
      })),
    );
    const valuation = normalize(
      companies.map((c) => ({
        symbol: c.symbol,
        v: typeof c.pe_ratio === 'number' ? c.pe_ratio : null,
      })),
      true, // lower P/E is better
    );
    const earningsQuality = normalize(
      companies.map((c) => ({
        symbol: c.symbol,
        v: typeof c.profit_margins === 'number' ? c.profit_margins : null,
      })),
    );
    const priceMomentum = normalize(
      companies.map((c) => ({
        symbol: c.symbol,
        v: typeof c.change_pct === 'number' ? c.change_pct : null,
      })),
    );
    const newsSentiment = normalize(
      companies.map((c) => {
        const s =
          sentiment[c.symbol] ||
          sentiment[c.name] ||
          ({} as NewsSentimentEntry);
        const raw = typeof s.score_0_100 === 'number' ? s.score_0_100 : null;
        return { symbol: c.symbol, v: raw };
      }),
    );

    const metrics: Array<[RadarKey, Record<string, number>]> = [
      ['Revenue Growth', revenueGrowth],
      ['Gross Margin', grossMargin],
      ['Valuation Attractiveness', valuation],
      ['Earnings Quality', earningsQuality],
      ['Price Momentum', priceMomentum],
      ['News Sentiment', newsSentiment],
    ];

    return metrics.map(([metric, values]) => {
      const row: Record<string, number | string> = { metric };
      for (const s of symbols) row[s] = values[s] ?? 0;
      return row;
    });
  }, [companies, sentiment]);

  if (!companies.length) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">
          Financial Profile
        </h3>
        <p className="text-[11px] text-slate-500">
          Each axis normalized 0–100 (higher = better) across the selected set.
        </p>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="78%">
            <PolarGrid stroke="#2A3550" />
            <PolarAngleAxis
              dataKey="metric"
              stroke="#94A3B8"
              tick={{ fontSize: 11, fill: '#94A3B8' }}
            />
            <PolarRadiusAxis stroke="#1C2333" tick={{ fontSize: 9, fill: '#64748B' }} angle={30} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1E2A3E',
                border: '1px solid #3B4D6B',
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: '#94A3B8' }}
              formatter={(v: number | string) =>
                typeof v === 'number' ? [v.toFixed(0), null] : [v, null]
              }
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
            {companies.map((c, idx) => {
              const color = colorForIdx(idx);
              return (
                <Radar
                  key={c.symbol}
                  name={c.symbol}
                  dataKey={c.symbol}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              );
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
