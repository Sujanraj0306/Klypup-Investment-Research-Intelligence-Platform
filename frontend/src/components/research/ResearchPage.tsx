import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { AgentStatusPanel } from './AgentStatusPanel';
import { ChatFollowup } from './ChatFollowup';
import { QueryInput, type QueryInputHandle } from './QueryInput';
import { ReportStreamView } from './ReportStreamView';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useResearch } from '../../hooks/useResearch';
import { useReports } from '../../hooks/useReports';
import { fmtDateShort } from '../../lib/format';
import { cn } from '../../lib/cn';

const SUGGESTED = [
  'Analyze NVIDIA Q3 earnings',
  'Compare FAANG valuations',
  'Tesla news and sentiment this month',
  'What are the biggest risks for Apple?',
  'Compare JPM and GS balance sheets',
];

export function ResearchPage() {
  const { state, startResearch, cancel, reset } = useResearch();
  const inputRef = useRef<QueryInputHandle | null>(null);
  const { data: recentReports } = useReports({ limit: 5 });
  const navigate = useNavigate();
  const location = useLocation();
  const [panelOpen, setPanelOpen] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');

  // Kick off voice mode if the nav-bar mic button routed us here.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('voice') === '1') {
      setTimeout(() => inputRef.current?.startVoice(), 250);
    }
    if (params.get('focus') === '1') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    const symbol = params.get('symbol');
    if (symbol && state.status === 'idle') {
      const q = `Give me a full research briefing on ${symbol}`;
      setCurrentQuery(q);
      startResearch(q, [symbol]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ⌘K shortcut — focus query input when already on the page.
  useEffect(() => {
    function onFocus() {
      inputRef.current?.focus();
    }
    window.addEventListener('klypup:focus-query', onFocus);
    return () => window.removeEventListener('klypup:focus-query', onFocus);
  }, []);

  const submit = useCallback(
    (query: string) => {
      setCurrentQuery(query);
      startResearch(query);
    },
    [startResearch],
  );

  const active = state.status === 'streaming' || state.status === 'complete' || state.status === 'error';

  return (
    <AppShell>
      {!active ? (
        <IdleView
          onSubmit={submit}
          inputRef={inputRef}
          isLoading={false}
          recentReports={recentReports?.items ?? []}
          onOpenReport={(id) => navigate(`/reports/${id}`)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside
            className={cn(
              'transition-all',
              panelOpen
                ? 'lg:block'
                : 'lg:block lg:w-14 lg:overflow-hidden',
            )}
          >
            {panelOpen ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">
                    Research run
                  </p>
                  <button
                    onClick={() => setPanelOpen(false)}
                    aria-label="Collapse panel"
                    className="rounded p-1 text-slate-500 hover:bg-bg-tertiary hover:text-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <AgentStatusPanel
                  steps={state.agentSteps}
                  progress={state.progress}
                  status={state.status}
                  toolsUsed={state.toolsUsed}
                />
                {state.status === 'streaming' && (
                  <Button variant="ghost" size="sm" onClick={cancel}>
                    Cancel run
                  </Button>
                )}
                {state.status !== 'streaming' && (
                  <Button variant="secondary" size="sm" onClick={reset}>
                    New query
                  </Button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setPanelOpen(true)}
                className="hidden h-full w-full items-center justify-center rounded-lg border border-border-subtle bg-bg-secondary text-slate-400 hover:text-slate-100 lg:flex"
                aria-label="Expand panel"
              >
                <Sparkles size={16} />
              </button>
            )}
          </aside>

          <div className="min-w-0">
            <div className="mb-4">
              <p className="text-xs text-slate-500">Your query</p>
              <p className="text-sm text-slate-100">{currentQuery}</p>
            </div>
            {state.status === 'complete' ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0">
                  <ReportStreamView state={state} query={currentQuery} />
                </div>
                <aside className="min-w-0">
                  <div className="sticky top-20 h-[calc(100vh-120px)] overflow-hidden rounded-2xl border border-border-subtle bg-bg-secondary">
                    <ChatFollowup
                      reportData={{
                        companies: state.companies,
                        sections: state.sections,
                      }}
                      reportTitle={currentQuery}
                    />
                  </div>
                </aside>
              </div>
            ) : (
              <ReportStreamView state={state} query={currentQuery} />
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

interface IdleViewProps {
  onSubmit: (query: string) => void;
  inputRef: React.RefObject<QueryInputHandle | null>;
  isLoading: boolean;
  recentReports: Array<{ id: string; title: string; createdAt: string | null; companies: string[] }>;
  onOpenReport: (id: string) => void;
}

function IdleView({
  onSubmit,
  inputRef,
  isLoading,
  recentReports,
  onOpenReport,
}: IdleViewProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue/10 text-brand-glow">
          <Sparkles size={18} />
        </span>
        <h1 className="text-2xl font-semibold text-slate-100">
          What do you want to research?
        </h1>
        <p className="text-sm text-slate-500">
          Ask anything about companies, markets, or filings. The agent will
          orchestrate market data, news, SEC filings, and social signals.
        </p>
      </div>

      <div className="w-full">
        <QueryInput
          ref={inputRef}
          onSubmit={onSubmit}
          isLoading={isLoading}
          autoFocus
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => onSubmit(s)}
            className="rounded-full border border-border-subtle bg-bg-tertiary px-3 py-1 text-xs text-slate-300 transition-colors hover:border-border-default hover:text-slate-100"
          >
            {s}
          </button>
        ))}
      </div>

      {recentReports.length > 0 && (
        <Card className="w-full">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent research
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {recentReports.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReport(r.id)}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-bg-tertiary"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{r.title}</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{fmtDateShort(r.createdAt)}</span>
                    {(r.companies || []).slice(0, 3).map((c) => (
                      <span key={c} className="font-mono">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[11px] text-brand-glow">Open →</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
