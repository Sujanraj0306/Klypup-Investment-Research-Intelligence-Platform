import { Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { readAloud, stopReading } from '../../lib/speechUtils';
import type { CompareSynthesisSection } from '../../types/compare';

interface CompareSynthesisProps {
  data: CompareSynthesisSection | null;
  symbols: string[];
}

function renderWithSources(text: string) {
  const parts: Array<string | { source: string }> = [];
  const regex = /\[Source:\s*([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ source: match[1].trim() });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
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

export function CompareSynthesis({ data, symbols }: CompareSynthesisProps) {
  if (!data) {
    return (
      <Card className="text-sm text-slate-500">
        Synthesis will appear when the comparison finishes.
      </Card>
    );
  }

  const paragraphs = (data.comparison_narrative || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const profiles = Object.entries(data.investor_profiles || {}).filter(
    ([, sym]) => Boolean(sym),
  );

  return (
    <Card className="flex flex-col gap-3 border-border-default bg-gradient-to-br from-bg-secondary to-bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue/10 text-brand-glow">
            <Sparkles size={14} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              AI Comparison Summary
            </h3>
            <p className="text-[11px] text-slate-500">
              {symbols.join(' · ')} — synthesized across market, news, and social
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Volume2 size={14} />}
            onClick={() =>
              readAloud(data.comparison_narrative || symbols.join(' vs '))
            }
          >
            Read aloud
          </Button>
          <Button variant="ghost" size="sm" onClick={stopReading} aria-label="Stop">
            <VolumeX size={14} />
          </Button>
        </div>
      </div>

      {paragraphs.length === 0 ? (
        <p className="text-sm text-slate-400">
          No synthesis generated for this comparison.
        </p>
      ) : (
        paragraphs.map((p, i) => (
          <p
            key={i}
            className="text-sm leading-7 text-slate-200"
            style={{ lineHeight: 1.7 }}
          >
            {renderWithSources(p)}
          </p>
        ))
      )}

      {profiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {profiles.map(([profile, sym]) => (
            <div
              key={profile}
              className="rounded-lg border border-border-subtle bg-bg-tertiary p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                For {profile}
              </p>
              <p className="mt-1 flex items-center gap-1 font-mono text-sm font-semibold text-gain">
                <Trophy size={12} />
                {sym}
              </p>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.key_differentiators) &&
        data.key_differentiators.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Key differentiators
            </p>
            <ul className="flex flex-col gap-1 text-xs text-slate-200">
              {data.key_differentiators.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-brand-glow">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
    </Card>
  );
}
