import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Star } from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { SectorHeatmap } from './SectorHeatmap';
import { MarketMovers } from './MarketMovers';
import { QuickActions } from './QuickActions';
import {
  WatchlistCard,
  WatchlistCardSkeleton,
} from '../watchlist/WatchlistCard';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useReports } from '../../hooks/useReports';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const recentReports = useReports({ limit: 3 });

  const topWatchlist = useMemo(
    () => (watchlist.data || []).slice(0, 6),
    [watchlist.data],
  );
  const recentItems = recentReports.data?.items || [];

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <section id="sector-heatmap">
            <SectorHeatmap />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <MarketMovers />
            </div>
            <div className="lg:col-span-3">
              <QuickActions />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  Your Watchlist
                </h3>
                {watchlist.data && (
                  <Badge variant="default">{watchlist.data.length}</Badge>
                )}
              </div>
              <button
                onClick={() => navigate('/watchlist')}
                className="text-xs text-brand-glow hover:underline"
              >
                View all →
              </button>
            </div>

            {watchlist.isLoading && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <WatchlistCardSkeleton key={i} />
                ))}
              </div>
            )}

            {watchlist.isError && (
              <Card className="text-sm text-loss">
                Failed to load watchlist.
              </Card>
            )}

            {!watchlist.isLoading &&
              !watchlist.isError &&
              topWatchlist.length === 0 && (
                <Card className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-slate-400">
                    <Star size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      Your watchlist is empty
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add companies to your watchlist to see them here.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    leftIcon={<Plus size={16} />}
                    onClick={() => navigate('/watchlist')}
                  >
                    Add Company
                  </Button>
                </Card>
              )}

            {topWatchlist.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {topWatchlist.map((item) => (
                  <WatchlistCard
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    price={item.price}
                    change={item.change}
                    changePct={item.changePct}
                    history={item.history || []}
                    sentiment={item.sentiment}
                    onOpen={() => navigate(`/research?symbol=${item.symbol}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Recent Research
              </h3>
              <button
                onClick={() => navigate('/reports')}
                className="text-xs text-brand-glow hover:underline"
              >
                All →
              </button>
            </div>
            {recentReports.isLoading && (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            )}
            {recentItems.length === 0 && !recentReports.isLoading && (
              <p className="py-4 text-xs text-slate-500">
                Saved reports will appear here.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {recentItems.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/reports/${r.id}`)}
                  className="flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-tertiary p-2 text-left transition-colors hover:border-border-default"
                >
                  <p className="truncate text-xs font-medium text-slate-100">
                    {r.title.length > 40 ? r.title.slice(0, 40) + '…' : r.title}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {formatDate(r.createdAt)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(r.companies || []).slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
