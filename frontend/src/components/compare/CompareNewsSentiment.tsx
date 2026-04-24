import { ExternalLink } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../ui/Card';
import { colorForIdx } from '../../lib/compareColors';
import type { NewsArticle, NewsSentimentEntry } from '../../types/research';

interface CompareNewsSentimentProps {
  symbols: string[];
  sentimentByTicker: Record<
    string,
    NewsSentimentEntry & { article_count?: number; articles?: NewsArticle[] }
  >;
}

export function CompareNewsSentiment({
  symbols,
  sentimentByTicker,
}: CompareNewsSentimentProps) {
  const chartData = [
    {
      bucket: 'Positive',
      ...Object.fromEntries(
        symbols.map((s) => [s, sentimentByTicker[s]?.positive || 0]),
      ),
    },
    {
      bucket: 'Neutral',
      ...Object.fromEntries(
        symbols.map((s) => [s, sentimentByTicker[s]?.neutral || 0]),
      ),
    },
    {
      bucket: 'Negative',
      ...Object.fromEntries(
        symbols.map((s) => [s, sentimentByTicker[s]?.negative || 0]),
      ),
    },
  ];

  const totalArticles = symbols.reduce(
    (acc, s) => acc + (sentimentByTicker[s]?.article_count || 0),
    0,
  );

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">
          News Sentiment Comparison
        </h3>
        <p className="text-[11px] text-slate-500">
          {totalArticles > 0
            ? `Across ${totalArticles} article${totalArticles === 1 ? '' : 's'}.`
            : 'No articles returned — configure NEWS_API_KEY or GNEWS_API_KEY.'}
        </p>
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid stroke="#2A3550" strokeDasharray="2 4" />
            <XAxis dataKey="bucket" stroke="#64748B" fontSize={11} />
            <YAxis stroke="#64748B" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1E2A3E',
                border: '1px solid #3B4D6B',
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: '#94A3B8' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
            {symbols.map((s, idx) => (
              <Bar key={s} dataKey={s} fill={colorForIdx(idx)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {symbols.map((s) => {
          const payload = sentimentByTicker[s];
          const top = payload?.articles?.[0];
          if (!top) return null;
          return (
            <a
              key={s}
              href={top.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-border-subtle bg-bg-tertiary p-3 hover:border-border-default"
            >
              <p className="mb-1 font-mono text-[11px] text-slate-500">
                Top headline · {s}
              </p>
              <p className="text-xs font-medium text-slate-100 group-hover:text-brand-glow">
                {top.title}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                {top.source || top.source_type} ·{' '}
                <span className="flex items-center gap-0.5 text-brand-glow">
                  Open <ExternalLink size={10} />
                </span>
              </p>
            </a>
          );
        })}
      </div>
    </Card>
  );
}
