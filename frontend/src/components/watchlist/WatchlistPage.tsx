import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useReorderWatchlist,
  useWatchlist,
} from '../../hooks/useWatchlist';
import { ApiError } from '../../lib/api';
import {
  WatchlistCard,
  WatchlistCardSkeleton,
} from './WatchlistCard';
import { AddCompany } from './AddCompany';

export function WatchlistPage() {
  const { data, isLoading, isError } = useWatchlist();
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();
  const reorderMutation = useReorderWatchlist();
  const toast = useToast();
  const navigate = useNavigate();
  const [dragSymbol, setDragSymbol] = useState<string | null>(null);

  const items = useMemo(() => data || [], [data]);

  const onAdd = async (symbol: string) => {
    try {
      await addMutation.mutateAsync(symbol);
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to add company';
      toast.error(msg);
    }
  };

  const onRemove = async (symbol: string) => {
    try {
      await removeMutation.mutateAsync(symbol);
      toast.success(`${symbol} removed`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove company',
      );
    }
  };

  const onDrop = async (targetSymbol: string) => {
    if (!dragSymbol || dragSymbol === targetSymbol) {
      setDragSymbol(null);
      return;
    }
    const order = items.map((i) => i.symbol);
    const from = order.indexOf(dragSymbol);
    const to = order.indexOf(targetSymbol);
    if (from < 0 || to < 0) {
      setDragSymbol(null);
      return;
    }
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragSymbol(null);
    try {
      await reorderMutation.mutateAsync(order);
    } catch {
      toast.error('Failed to save new order');
    }
  };

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">My Watchlist</h2>
          <Badge variant="default">{items.length}</Badge>
        </div>
        <AddCompany
          onPick={onAdd}
          isSubmitting={addMutation.isPending}
          existingSymbols={items.map((i) => i.symbol)}
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <WatchlistCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <Card className="text-center text-sm text-loss">
          Failed to load watchlist. Check the backend is running.
        </Card>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-slate-400">
            <Star size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">
              No companies yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add your first company to start tracking.
            </p>
          </div>
          <AddCompany onPick={onAdd} isSubmitting={addMutation.isPending} />
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.symbol}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(item.symbol)}
            >
              <WatchlistCard
                symbol={item.symbol}
                name={item.name}
                price={item.price}
                change={item.change}
                changePct={item.changePct}
                history={item.history || []}
                sentiment={item.sentiment}
                draggable
                onDragStart={() => setDragSymbol(item.symbol)}
                onRemove={() => onRemove(item.symbol)}
                onOpen={() => navigate(`/research?symbol=${item.symbol}`)}
              />
            </div>
          ))}
        </div>
      )}

      {reorderMutation.isPending && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Spinner size="sm" /> Saving order...
        </div>
      )}
    </AppShell>
  );
}
