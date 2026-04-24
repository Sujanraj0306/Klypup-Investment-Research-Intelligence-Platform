import { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { searchSymbols } from '../../hooks/useMarketData';
import { useDebounced } from '../../hooks/useDebounced';
import type { SymbolSearchResult } from '../../types';

interface AddCompanyProps {
  onPick: (symbol: string) => void | Promise<void>;
  isSubmitting?: boolean;
  existingSymbols?: string[];
}

export function AddCompany({
  onPick,
  isSubmitting,
  existingSymbols = [],
}: AddCompanyProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 200);
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
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

  const existing = new Set(existingSymbols.map((s) => s.toUpperCase()));

  async function handlePick(symbol: string) {
    await onPick(symbol);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div className="w-72">
          <Input
            autoFocus
            name="watchlist-search"
            placeholder="Search ticker or company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={<Search size={14} />}
          />
          {(query.trim() || loading) && (
            <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-default bg-bg-secondary shadow-xl">
              {loading && (
                <div className="flex items-center justify-center gap-2 p-3 text-xs text-slate-500">
                  <Spinner size="sm" /> Searching...
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="p-3 text-xs text-slate-500">
                  No matches. Try a different ticker or name.
                </div>
              )}
              {!loading &&
                results.map((r) => {
                  const already = existing.has(r.symbol.toUpperCase());
                  return (
                    <button
                      key={r.symbol}
                      disabled={already || isSubmitting}
                      onClick={() => handlePick(r.symbol)}
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
                        <span className="text-[11px] text-slate-500">
                          Added
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setOpen(true)}
        >
          Add Company
        </Button>
      )}
    </div>
  );
}
