import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  MarketMoversResponse,
  PriceHistory,
  Quote,
  SectorData,
  SymbolSearchResult,
} from '../types';

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export function useQuote(symbol: string | null | undefined) {
  return useQuery<Quote>({
    queryKey: ['quote', symbol],
    queryFn: () => api.get<Quote>(`/api/market/quote/${symbol}`),
    enabled: Boolean(symbol),
    staleTime: FIVE_MIN,
  });
}

export function useHistory(
  symbol: string | null | undefined,
  period: string = '1mo',
  interval: string = '1d',
) {
  return useQuery<PriceHistory[]>({
    queryKey: ['history', symbol, period, interval],
    queryFn: () =>
      api.get<PriceHistory[]>(
        `/api/market/history/${symbol}?period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`,
      ),
    enabled: Boolean(symbol),
    staleTime: FIVE_MIN,
  });
}

export function useSectorHeatmap() {
  return useQuery<SectorData[]>({
    queryKey: ['sector-heatmap'],
    queryFn: () => api.get<SectorData[]>('/api/market/sector-heatmap'),
    staleTime: FIFTEEN_MIN,
    refetchInterval: FIFTEEN_MIN,
  });
}

export function useMarketMovers() {
  return useQuery<MarketMoversResponse>({
    queryKey: ['market-movers'],
    queryFn: () => api.get<MarketMoversResponse>('/api/market/movers'),
    staleTime: TEN_MIN,
    refetchInterval: TEN_MIN,
  });
}

export function useMultiQuote(symbols: string[]) {
  const key = symbols.join(',');
  return useQuery<Quote[]>({
    queryKey: ['multi-quote', key],
    queryFn: () =>
      api.get<Quote[]>(
        `/api/market/multi-quote?symbols=${encodeURIComponent(key)}`,
      ),
    enabled: symbols.length > 0,
    staleTime: FIVE_MIN,
  });
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  if (!query.trim()) return [];
  return api.post<SymbolSearchResult[]>('/api/market/search', { query });
}
