import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { WatchlistItem } from '../types';

const FIVE_MIN = 5 * 60 * 1000;

export function useWatchlist() {
  return useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: () => api.get<WatchlistItem[]>('/api/watchlist'),
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation<WatchlistItem, Error, string>({
    mutationFn: (symbol: string) =>
      api.post<WatchlistItem>('/api/watchlist', { symbol }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (symbol: string) =>
      api.delete<void>(`/api/watchlist/${encodeURIComponent(symbol)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useReorderWatchlist() {
  const qc = useQueryClient();
  return useMutation<void, Error, string[]>({
    mutationFn: (order: string[]) =>
      api.patch<void>('/api/watchlist/order', { order }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}
