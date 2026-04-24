import { ExternalLink, MessageSquare, TrendingUp } from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from 'recharts';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { SourceRow } from './SourceChip';
import type { SocialSectionData } from '../../types/research';

interface SocialSectionProps {
  data: SocialSectionData;
}

export function SocialSection({ data }: SocialSectionProps) {
  const entries = Object.entries(data.data || {});

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <TrendingUp size={14} /> Social &amp; Search Trends
        </h3>
        <SourceRow sources={data.sources || ['Google Trends', 'Reddit']} />
      </div>

      {entries.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-subtle p-4 text-center text-xs text-slate-500">
          No social data collected — configure Reddit credentials or check
          Google Trends availability.
        </p>
      )}

      {entries.map(([ticker, payload]) => {
        const trendValues = payload.google_trends?.values || [];
        const trendDates = payload.google_trends?.dates || [];
        const chartData = trendValues.map((v, i) => ({
          date: trendDates[i] || `${i}`,
          value: v,
        }));
        const posts = payload.reddit_posts || [];
        return (
          <div key={ticker} className="rounded-lg border border-border-subtle bg-bg-tertiary p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-100">
                  {ticker}
                </p>
                <p className="text-[11px] text-slate-500">
                  Search Interest (90 days)
                </p>
              </div>
              {payload.google_trends?.current_score !== undefined &&
                payload.google_trends?.current_score !== null && (
                  <Badge variant="info">
                    Score {payload.google_trends.current_score}
                  </Badge>
                )}
            </div>

            <div className="h-20">
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#60A5FA"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <ReTooltip
                      contentStyle={{
                        backgroundColor: '#1E2A3E',
                        border: '1px solid #3B4D6B',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-[11px] text-slate-600">
                  No Google Trends data
                </p>
              )}
            </div>

            <div className="mt-3 rounded-md border border-border-subtle bg-bg-secondary p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                  <MessageSquare size={12} /> Reddit
                </span>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>
                    {payload.reddit_mention_count ?? 0} mentions
                  </span>
                  {typeof payload.reddit_avg_score === 'number' && (
                    <span>
                      · avg {payload.reddit_avg_score.toFixed(0)} ⬆
                    </span>
                  )}
                </div>
              </div>
              {posts.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No recent posts. Configure REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET
                  to see community chatter.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {posts.slice(0, 3).map((p, i) => (
                    <li key={i}>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-bg-tertiary"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[12px] text-slate-100 group-hover:text-brand-glow">
                            {p.title}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            r/{p.subreddit} · {p.score} ⬆ · {p.num_comments} comments
                          </p>
                        </div>
                        <ExternalLink
                          size={10}
                          className="mt-1 flex-shrink-0 text-slate-500"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}

      {data.narrative && (
        <p className="text-xs leading-relaxed text-slate-300">{data.narrative}</p>
      )}
    </Card>
  );
}
