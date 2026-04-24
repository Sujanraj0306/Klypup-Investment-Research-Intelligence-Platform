import { useEffect, useRef, useState } from 'react';
import { Plus, Search as SearchIcon, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { searchSymbols } from '../../hooks/useMarketData';
import { useDebounced } from '../../hooks/useDebounced';
import type { SymbolSearchResult } from '../../types';

interface CompanySelectorProps {
  symbols: string[];
  maxSymbols?: number;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  disabled?: boolean;
}

export function CompanySelector({
  symbols,
  maxSymbols = 4,
  onAdd,
  onRemove,
  disabled,
}: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 200);
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchSymbols(debounced)
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const canAdd = symbols.length < maxSymbols;
  const existing = new Set(symbols.map((s) => s.toUpperCase()));

  const pick = (symbol: string) => {
    onAdd(symbol.toUpperCase());
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      {symbols.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-tertiary px-2.5 py-1 font-mono text-xs text-slate-100"
        >
          {s}
          <button
            onClick={() => onRemove(s)}
            aria-label={`Remove ${s}`}
            disabled={disabled}
            className="text-slate-500 hover:text-loss"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {canAdd && !disabled && (
        <div className="relative">
          {open ? (
            <div className="w-72">
              <Input
                ref={inputRef}
                autoFocus
                name="compare-search"
                placeholder="Search ticker or company…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                leftIcon={<SearchIcon size={14} />}
              />
              {(query.trim() || loading) && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-default bg-bg-secondary shadow-xl">
                  {loading && (
                    <div className="flex items-center justify-center gap-2 p-3 text-xs text-slate-500">
                      <Spinner size="sm" /> Searching…
                    </div>
                  )}
                  {!loading && results.length === 0 && (
                    <div className="p-3 text-xs text-slate-500">
                      No matches.
                    </div>
                  )}
                  {!loading &&
                    results.map((r) => {
                      const already = existing.has(r.symbol.toUpperCase());
                      return (
                        <button
                          key={r.symbol}
                          disabled={already}
                          onClick={() => pick(r.symbol)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border-subtle px-3 py-2 text-left text-sm last:border-b-0 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">
                              {r.name}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {r.symbol} · {r.exchange}
                            </p>
                          </div>
                          {already && (
                            <span className="text-[11px] text-slate-500">Added</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-default bg-bg-secondary px-3 py-1 text-xs text-slate-400 hover:border-border-strong hover:text-slate-100"
            >
              <Plus size={12} /> Add company
            </button>
          )}
        </div>
      )}
      {!canAdd && (
        <span className="text-[11px] text-slate-500">
          Max {maxSymbols} companies
        </span>
      )}
    </div>
  );
}
