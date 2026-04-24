import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { SourceRow } from './SourceChip';
import { cn } from '../../lib/cn';
import type { FilingsSectionData } from '../../types/research';

interface FilingsSectionProps {
  data: FilingsSectionData;
  query?: string;
}

function highlightTerms(text: string, terms: string[]) {
  if (!terms.length || !text) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark
            key={i}
            className="rounded bg-neutral/30 px-0.5 text-slate-100"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function filingTypes(data: FilingsSectionData): string[] {
  const set = new Set<string>();
  for (const p of data.passages || []) {
    const ft = p.metadata?.filing_type;
    if (ft) set.add(ft);
  }
  return Array.from(set).sort();
}

export function FilingsSection({ data, query }: FilingsSectionProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const passages = data.passages || [];

  const terms = useMemo(
    () =>
      (query || '')
        .split(/\s+/)
        .map((t) => t.replace(/[^\w]/g, ''))
        .filter((t) => t.length >= 4)
        .slice(0, 6),
    [query],
  );

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileText size={14} /> SEC Filings &amp; Earnings Transcripts
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {filingTypes(data).map((t) => (
              <Badge key={t} variant="info">
                {t}
              </Badge>
            ))}
          </div>
        </div>
        <SourceRow sources={data.sources || ['SEC EDGAR', 'ChromaDB RAG']} />
      </div>

      {passages.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-subtle p-4 text-center text-xs text-slate-500">
          No filings passages were retrieved. Run <code className="font-mono">scripts/ingest_filings.py</code>{' '}
          to build the RAG index, or this ticker may not have any ingested filings.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {passages.map((p, idx) => {
          const open = openIdx === idx;
          const meta = p.metadata || {};
          const ticker = meta.ticker || p.ticker || '?';
          const ft = meta.filing_type || '—';
          const period = meta.period || '—';
          const url = meta.source_url || p.source_url;
          return (
            <div
              key={idx}
              className="rounded-lg border border-border-subtle bg-bg-tertiary"
            >
              <button
                onClick={() => setOpenIdx(open ? null : idx)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Badge variant="default" className="font-mono">
                    {ft}
                  </Badge>
                  <span className="font-mono text-xs text-slate-100">
                    {ticker}
                  </span>
                  <span className="text-[11px] text-slate-500">{period}</span>
                </div>
                {typeof p.relevance_score === 'number' && (
                  <Badge variant="info">
                    {(p.relevance_score * 100).toFixed(0)}% relevance
                  </Badge>
                )}
              </button>
              {open && (
                <div className="border-t border-border-subtle px-3 py-3 text-xs leading-relaxed text-slate-300">
                  <p className={cn('whitespace-pre-wrap')}>
                    {highlightTerms(p.text || '', terms)}
                  </p>
                  {url && (
                    <a
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-glow hover:underline"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on SEC.gov <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.narrative && (
        <p className="text-xs leading-relaxed text-slate-300">{data.narrative}</p>
      )}
    </Card>
  );
}
