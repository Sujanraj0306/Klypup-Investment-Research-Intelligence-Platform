import { useCallback, useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useCompare } from '../../hooks/useCompare';
import { COMPARE_PRESETS } from '../../types/compare';
import { CompanySelector } from './CompanySelector';
import { CompanyHeaderRow } from './CompanyHeaderRow';
import { ComparePricePerformance } from './ComparePricePerformance';
import { CompareRadar } from './CompareRadar';
import { CompareMetricsTable } from './CompareMetricsTable';
import { CompareNewsSentiment } from './CompareNewsSentiment';
import { CompareSynthesis } from './CompareSynthesis';
import type { MarketCompanyData, NewsSentimentEntry } from '../../types/research';

export function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const { state, startCompare, reset } = useCompare();

  const add = useCallback((s: string) => {
    setSymbols((prev) => (prev.includes(s) ? prev : [...prev, s].slice(0, 4)));
  }, []);
  const remove = useCallback((s: string) => {
    setSymbols((prev) => prev.filter((x) => x !== s));
  }, []);

  const canCompare = symbols.length >= 2 && state.status !== 'streaming';

  const applyPreset = (preset: string[]) => {
    setSymbols(preset.slice(0, 4));
    if (state.status !== 'streaming') reset();
  };

  const run = () => {
    if (!canCompare) return;
    reset();
    startCompare(symbols);
  };

  const companies: MarketCompanyData[] = useMemo(() => {
    const map = state.market?.data || {};
    return symbols.map((s) => (map[s] as MarketCompanyData) || createEmptyCompany(s));
  }, [state.market, symbols]);

  const sentimentByTicker: Record<
    string,
    NewsSentimentEntry & { article_count?: number; articles?: never[] }
  > = useMemo(
    () => (state.news?.sentiment_by_ticker as Record<string, NewsSentimentEntry & { article_count?: number }>) || {},
    [state.news],
  );

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">
            Compare Companies
          </h2>
          <Badge variant="info">Beta</Badge>
        </div>
        {state.status !== 'idle' && (
          <Button variant="ghost" size="sm" onClick={() => { reset(); setSymbols([]); }}>
            Clear
          </Button>
        )}
      </div>

      <Card className="mb-5 flex flex-col gap-3">
        <div>
          <p className="mb-2 text-xs text-slate-500">
            Add 2–4 companies to compare them side-by-side.
          </p>
          <CompanySelector
            symbols={symbols}
            onAdd={add}
            onRemove={remove}
            disabled={state.status === 'streaming'}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-500">Presets:</span>
          {COMPARE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.symbols)}
              className="rounded-full border border-border-subtle bg-bg-tertiary px-2.5 py-1 text-xs text-slate-300 hover:border-border-default hover:text-slate-100"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            {symbols.length < 2
              ? `Select ${2 - symbols.length} more to compare`
              : `Ready to compare ${symbols.length} companies`}
          </p>
          <Button
            variant="primary"
            onClick={run}
            disabled={!canCompare}
            loading={state.status === 'streaming'}
          >
            Compare
          </Button>
        </div>
      </Card>

      {state.status === 'idle' && (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-slate-400">
            <BarChart2 size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">
              Select companies to compare
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add 2–4 tickers or pick a preset. Klypup will orchestrate market
              data, news, and social analysis for all of them in parallel.
            </p>
          </div>
        </Card>
      )}

      {state.status === 'streaming' && (
        <Card className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-100">
              Analyzing {symbols.join(' · ')}…
            </p>
            <span className="text-[11px] text-slate-500">
              {state.progress}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-brand-blue transition-all duration-500"
              style={{ width: `${Math.max(state.progress, 3)}%` }}
            />
          </div>
          <ul className="flex flex-col gap-1 text-[11px] text-slate-400">
            {state.steps.slice(-4).map((s, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Spinner size="sm" /> {s.step}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.error && (
        <Card className="mb-4 border-loss/40 bg-loss-subtle text-sm text-loss">
          {state.error}
        </Card>
      )}

      {(state.market || state.status === 'complete') && symbols.length > 0 && (
        <div className="flex flex-col gap-4">
          <CompanyHeaderRow companies={companies} />
          <ComparePricePerformance companies={companies} />
          <CompareRadar companies={companies} sentiment={sentimentByTicker} />
          <CompareMetricsTable companies={companies} />
          <CompareNewsSentiment
            symbols={symbols}
            sentimentByTicker={sentimentByTicker}
          />
          <CompareSynthesis data={state.synthesis} symbols={symbols} />
        </div>
      )}
    </AppShell>
  );
}

function createEmptyCompany(symbol: string): MarketCompanyData {
  return {
    symbol,
    name: symbol,
    price: null,
    change_pct: null,
    market_cap: null,
    pe_ratio: null,
    forward_pe: null,
    eps: null,
    revenue: null,
    revenue_growth: null,
    gross_margins: null,
    profit_margins: null,
    week_52_high: null,
    week_52_low: null,
    volume: null,
    beta: null,
    history: [],
  };
}
