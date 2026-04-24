import { useState } from 'react';
import { ExternalLink, Volume2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SourceRow } from './SourceChip';
import { SentimentGauge } from './SentimentGauge';
import { cn } from '../../lib/cn';
import { fmtDate } from '../../lib/format';
import { readAloud, stopReading } from '../../lib/speechUtils';
import type { NewsSectionData } from '../../types/research';

interface NewsSectionProps {
  data: NewsSectionData;
}

const DEFAULT_SHOWN = 8;

function labelColor(label?: string) {
  if (label === 'positive') return 'bg-gain';
  if (label === 'negative') return 'bg-loss';
  return 'bg-neutral';
}

function labelTextColor(label?: string) {
  if (label === 'positive') return 'text-gain';
  if (label === 'negative') return 'text-loss';
  return 'text-neutral';
}

export function NewsSection({ data }: NewsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const articles = data.articles || [];
  const visible = showAll ? articles : articles.slice(0, DEFAULT_SHOWN);

  const firstCompany = Object.keys(data.sentiment_by_company || {})[0];
  const firstSentiment = firstCompany
    ? (data.sentiment_by_company || {})[firstCompany]
    : undefined;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">News</h3>
          <p className="text-xs text-slate-500">
            Headlines with sentiment analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Volume2 size={14} />}
            onClick={() => {
              if (data.narrative) readAloud(data.narrative);
            }}
            onDoubleClick={() => stopReading()}
          >
            Read
          </Button>
          <SourceRow sources={data.sources || ['NewsAPI', 'GNews']} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="flex flex-col gap-2 md:col-span-3">
          {articles.length === 0 && (
            <p className="rounded-lg border border-dashed border-border-subtle p-4 text-center text-xs text-slate-500">
              No news articles found. Configure NEWS_API_KEY or GNEWS_API_KEY on
              the backend.
            </p>
          )}
          {visible.map((a, i) => (
            <a
              key={a.url || i}
              href={a.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-tertiary p-3 transition-colors hover:border-border-default"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-medium text-slate-100 group-hover:text-brand-glow">
                  {a.title}
                </p>
                {a.sentiment_label && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <span
                      className={cn('h-2 w-2 rounded-full', labelColor(a.sentiment_label))}
                    />
                    <span className={labelTextColor(a.sentiment_label)}>
                      {a.sentiment_label}
                    </span>
                  </span>
                )}
              </div>
              {a.description && (
                <p className="line-clamp-2 text-[11px] text-slate-400">
                  {a.description}
                </p>
              )}
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {a.source || a.source_type || '—'} · {fmtDate(a.published_at)}
                </span>
                <span className="flex items-center gap-1 text-brand-glow">
                  Read article <ExternalLink size={10} />
                </span>
              </div>
            </a>
          ))}
          {articles.length > DEFAULT_SHOWN && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-xs text-brand-glow hover:underline"
            >
              {showAll
                ? 'Show fewer'
                : `Show ${articles.length - DEFAULT_SHOWN} more articles`}
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-tertiary p-4 md:col-span-2">
          <p className="text-xs font-medium text-slate-400">
            {firstCompany ? `Sentiment · ${firstCompany}` : 'Sentiment'}
          </p>
          <SentimentGauge
            score={firstSentiment?.score_0_100 ?? 50}
            label={firstSentiment?.label ?? 'neutral'}
            articleCount={articles.length}
            breakdown={{
              positive: firstSentiment?.positive ?? 0,
              neutral: firstSentiment?.neutral ?? 0,
              negative: firstSentiment?.negative ?? 0,
            }}
          />
        </div>
      </div>

      {data.narrative && (
        <p className="text-xs leading-relaxed text-slate-300">{data.narrative}</p>
      )}
    </Card>
  );
}
