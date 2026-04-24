import { useMemo } from 'react';
import {
  AlertTriangle,
  Info,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { readAloud, stopReading } from '../../lib/speechUtils';
import type { SynthesisSectionData } from '../../types/research';

interface SynthesisSectionProps {
  data: SynthesisSectionData;
  companies?: string[];
}

/**
 * Replace inline [Source: ...] markers with styled chips.
 */
function renderWithSources(summary: string) {
  const parts: Array<string | { source: string }> = [];
  const regex = /\[Source:\s*([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(summary)) !== null) {
    if (match.index > lastIndex) parts.push(summary.slice(lastIndex, match.index));
    parts.push({ source: match[1].trim() });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < summary.length) parts.push(summary.slice(lastIndex));

  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <span key={i}>{part}</span>
    ) : (
      <span
        key={i}
        className="mx-0.5 inline-flex items-center rounded-full border border-brand-blue/40 bg-brand-blue/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brand-glow"
      >
        {part.source}
      </span>
    ),
  );
}

function findingIcon(text: string) {
  const lower = text.toLowerCase();
  if (/(risk|warning|concern|decline|drop)/.test(lower))
    return <AlertTriangle size={12} className="text-loss" />;
  if (/(caution|watch|monitor|volatile|elevated)/.test(lower))
    return <AlertTriangle size={12} className="text-neutral" />;
  return <Info size={12} className="text-brand-glow" />;
}

export function SynthesisSection({ data, companies }: SynthesisSectionProps) {
  const paragraphs = useMemo(
    () =>
      (data.summary || '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean),
    [data.summary],
  );
  const hasComparison = Array.isArray(data.comparison_table) && data.comparison_table.length > 0;

  // Try to detect a comparison winner column by majority "winner" tag.
  const tableColumns = useMemo(() => {
    if (!hasComparison) return [] as string[];
    const row = data.comparison_table![0];
    return Object.keys(row).filter((k) => k !== 'metric' && k !== 'winner');
  }, [hasComparison, data.comparison_table]);

  return (
    <Card className="relative flex flex-col gap-3 border-border-default bg-gradient-to-br from-bg-secondary to-bg-elevated">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue/10 text-brand-glow">
            <Sparkles size={14} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">AI Analysis</h3>
            <p className="text-[11px] text-slate-500">
              Synthesis across all gathered sources
              {companies && companies.length > 0 && ` · ${companies.join(', ')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Volume2 size={14} />}
            onClick={() => readAloud(data.summary || '')}
          >
            Read aloud
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Stop reading"
            onClick={stopReading}
          >
            <VolumeX size={14} />
          </Button>
        </div>
      </div>

      {paragraphs.length === 0 && (
        <p className="text-sm text-slate-400">
          No synthesis was produced for this query.
        </p>
      )}
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="text-sm leading-7 text-slate-200"
          style={{ lineHeight: 1.7 }}
        >
          {renderWithSources(p)}
        </p>
      ))}

      {hasComparison && (
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-tertiary text-slate-500">
              <tr>
                <th className="p-2 text-left font-medium">Metric</th>
                {tableColumns.map((c) => (
                  <th key={c} className="p-2 text-right font-mono text-slate-300">
                    {c}
                  </th>
                ))}
                <th className="p-2 text-right font-medium">Winner</th>
              </tr>
            </thead>
            <tbody>
              {data.comparison_table!.map((row, i) => {
                const winner =
                  typeof row.winner === 'string' ? row.winner : undefined;
                return (
                  <tr key={i} className="border-t border-border-subtle">
                    <td className="p-2 text-slate-300">{String(row.metric)}</td>
                    {tableColumns.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          'p-2 text-right font-mono text-slate-200',
                          winner === c && 'bg-gain/10 text-gain',
                        )}
                      >
                        {String(row[c] ?? '—')}
                      </td>
                    ))}
                    <td className="p-2 text-right text-[11px]">
                      {winner ? (
                        <span className="inline-flex items-center gap-1 text-gain">
                          <Trophy size={10} /> {winner}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {Array.isArray(data.key_findings) && data.key_findings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Key findings
          </p>
          <ul className="flex flex-col gap-1.5">
            {data.key_findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-200">
                <span className="mt-0.5">{findingIcon(f)}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recommendation && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3 text-xs text-slate-200">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-brand-glow">
            Recommendation
          </p>
          {data.recommendation}
        </div>
      )}
    </Card>
  );
}
