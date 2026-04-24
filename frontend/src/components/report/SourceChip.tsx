import { ExternalLink } from 'lucide-react';

interface SourceChipProps {
  label: string;
  href?: string;
}

export function SourceChip({ label, href }: SourceChipProps) {
  const inner = (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-tertiary px-2 py-0.5 text-[11px] text-slate-400">
      {label}
      {href && <ExternalLink size={10} />}
    </span>
  );
  if (!href) return inner;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:brightness-125"
    >
      {inner}
    </a>
  );
}

export function SourceRow({ sources }: { sources?: string[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((s) => (
        <SourceChip key={s} label={s} />
      ))}
    </div>
  );
}
