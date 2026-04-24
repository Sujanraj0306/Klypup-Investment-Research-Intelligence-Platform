import type { MarketCompanyData, NewsSentimentEntry, SocialTickerData } from './research';

export type MetricKey =
  | 'revenue_growth'
  | 'valuation'
  | 'forward_valuation'
  | 'momentum'
  | 'sentiment'
  | 'gross_margins'
  | 'profit_margins'
  | 'revenue'
  | 'market_cap';

export type InvestorProfile = 'growth' | 'value' | 'momentum' | 'income' | 'sentiment';

export interface CompareMarketSection {
  data: Record<string, MarketCompanyData>;
  sources?: string[];
}

export interface CompareNewsSection {
  sentiment_by_ticker: Record<
    string,
    NewsSentimentEntry & { article_count?: number; articles?: Array<{ title: string; url?: string; source?: string }> }
  >;
  sources?: string[];
}

export interface CompareSocialSection {
  data: Record<string, SocialTickerData>;
  sources?: string[];
}

export interface CompareSynthesisSection {
  metric_winners?: Partial<Record<MetricKey, string>>;
  comparison_narrative?: string;
  investor_profiles?: Partial<Record<InvestorProfile, string>>;
  key_differentiators?: string[];
}

export interface CompareAgentStep {
  step: string;
  progress: number;
}

export interface CompareState {
  status: 'idle' | 'streaming' | 'complete' | 'error';
  symbols: string[];
  progress: number;
  steps: CompareAgentStep[];
  market: CompareMarketSection | null;
  news: CompareNewsSection | null;
  social: CompareSocialSection | null;
  synthesis: CompareSynthesisSection | null;
  durationMs: number | null;
  error: string | null;
}

export interface ComparePreset {
  label: string;
  symbols: string[];
}

export const COMPARE_PRESETS: ComparePreset[] = [
  { label: 'FAANG', symbols: ['META', 'AMZN', 'AAPL', 'NFLX'] },
  { label: 'Big Banks', symbols: ['JPM', 'BAC', 'GS'] },
  { label: 'Chip Makers', symbols: ['NVDA', 'AMD', 'INTC'] },
  { label: 'EV Makers', symbols: ['TSLA', 'GM', 'F'] },
];
