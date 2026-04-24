import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Search as SearchIcon, Trash2, Sparkles } from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import { useDebounced } from '../../hooks/useDebounced';
import { useDeleteReport, useReports } from '../../hooks/useReports';
import type { Report } from '../../types';
import { cn } from '../../lib/cn';

type SortKey = 'newest' | 'oldest' | 'mostCompanies';
const PAGE_SIZE = 20;

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ReportsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const deleteMutation = useDeleteReport();

  const [rawQuery, setRawQuery] = useState('');
  const debouncedQuery = useDebounced(rawQuery, 300);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('newest');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useReports({
    search: debouncedQuery || undefined,
    tags: activeTags.length ? activeTags : undefined,
    limit,
  });

  const items: Report[] = data?.items || [];
  const semantic = data?.semantic || [];
  const semanticIds = new Set(semantic.map((s) => s.report_id));

  const sorted = useMemo(() => {
    const copy = [...items];
    if (sort === 'newest') {
      copy.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
    } else if (sort === 'oldest') {
      copy.sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
    } else {
      copy.sort((a, b) => (b.companies?.length || 0) - (a.companies?.length || 0));
    }
    return copy;
  }, [items, sort]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const r of items) for (const t of r.tags || []) tagSet.add(t);
    return Array.from(tagSet).sort();
  }, [items]);

  const onSubmit = (e: FormEvent) => e.preventDefault();

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Report deleted');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete report',
      );
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Research Archive
          </h2>
          <Badge variant="default">{sorted.length}</Badge>
        </div>
        <Button variant="primary" onClick={() => navigate('/research')}>
          Start Research
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mb-4">
        <Input
          name="reports-search"
          placeholder="Search by company, query, or topic…"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          leftIcon={<SearchIcon size={16} />}
        />
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {availableTags.length > 0 && (
          <>
            <span className="text-xs text-slate-500">Filter by tag:</span>
            {availableTags.map((tag) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    active
                      ? 'border-brand-blue bg-brand-blue/10 text-brand-glow'
                      : 'border-border-subtle bg-bg-tertiary text-slate-400 hover:border-border-default',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </>
        )}
        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-border-default bg-bg-tertiary px-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="mostCompanies">Most companies</option>
          </select>
        </div>
      </div>

      {debouncedQuery && semantic.length > 0 && (
        <p className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <Sparkles size={14} className="text-brand-glow" />
          Showing {semantic.length} semantically-similar report{semantic.length === 1 ? '' : 's'}.
        </p>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {isError && (
        <Card className="text-center text-sm text-loss">
          Failed to load reports.
        </Card>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-slate-400">
            <Archive size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">
              No research reports yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Start by asking a research question.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/research')}>
            Start Research
          </Button>
        </Card>
      )}

      {sorted.length > 0 && (
        <div className="flex flex-col gap-3">
          {sorted.map((report) => (
            <Card
              key={report.id}
              className="group flex flex-col gap-2"
              onClick={() => navigate(`/reports/${report.id}`)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {report.title}
                    </h3>
                    {semanticIds.has(report.id) && (
                      <Badge variant="info">Similar</Badge>
                    )}
                    {report.status === 'complete' ? (
                      <Badge variant="gain">Complete</Badge>
                    ) : report.status === 'error' ? (
                      <Badge variant="loss">Error</Badge>
                    ) : (
                      <Badge variant="neutral">Streaming</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {truncate(report.query || '', 100)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{formatDate(report.createdAt)}</span>
                  {confirmingId === report.id ? (
                    <>
                      <button
                        className="rounded px-2 py-0.5 text-xs text-loss hover:bg-loss/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(report.id);
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-bg-tertiary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      aria-label="Delete report"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(report.id);
                      }}
                      className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-loss/10 hover:text-loss group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {(report.companies || []).slice(0, 8).map((c) => (
                  <Badge key={c} variant="default" className="font-mono">
                    {c}
                  </Badge>
                ))}
                {(report.tags || []).map((t) => (
                  <Badge key={t} variant="info">
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}

          {items.length >= limit && (
            <div className="mt-2 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
