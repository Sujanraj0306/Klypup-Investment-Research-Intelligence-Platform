export interface OrgMetadata {
  name: string;
  createdAt?: unknown;
  adminUids: string[];
}

export interface UserDoc {
  defaultOrg: string;
  displayName: string | null;
  email: string | null;
  createdAt?: unknown;
}

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  revenue: number | null;
  week52High: number | null;
  week52Low: number | null;
  sector: string;
  industry: string;
  description?: string;
}

export interface PriceHistory {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface SectorData {
  symbol: string;
  sectorName: string;
  changePct: number | null;
  ytdChange: number | null;
  marketCapWeight?: number | null;
  topMovers?: Array<{ symbol: string; changePct: number }>;
}

export interface MoverRow {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MarketMoversResponse {
  gainers: MoverRow[];
  losers: MoverRow[];
}

export interface WatchlistItem extends Quote {
  addedAt: string | null;
  order?: number;
  history: number[];
  sentiment?: Sentiment;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// ---- Reports ----

export type ReportStatus = 'complete' | 'streaming' | 'error';

export interface MarketSection {
  summary?: string;
  overview?: string;
  keyMetrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NewsSection {
  summary?: string;
  items?: Array<{ title: string; url: string; source?: string; publishedAt?: string }>;
  [key: string]: unknown;
}

export interface FilingsSection {
  summary?: string;
  items?: Array<{ title: string; url: string; date?: string }>;
  [key: string]: unknown;
}

export interface SocialSection {
  summary?: string;
  mentions?: number;
  sentimentScore?: number;
  [key: string]: unknown;
}

export interface SynthesisSection {
  summary?: string;
  recommendation?: string;
  theses?: string[];
  [key: string]: unknown;
}

export interface RisksSection {
  summary?: string;
  items?: string[];
  [key: string]: unknown;
}

export interface ReportSections {
  market?: MarketSection;
  news?: NewsSection;
  filings?: FilingsSection;
  social?: SocialSection;
  synthesis?: SynthesisSection;
  risks?: RisksSection;
  [key: string]: unknown;
}

export interface Report {
  id: string;
  title: string;
  query: string;
  companies: string[];
  tags: string[];
  createdAt: string | null;
  updatedAt?: string | null;
  authorUid?: string;
  status: ReportStatus;
  sourceCount: number;
  durationMs: number;
  summary?: string;
  sections: ReportSections;
}

export interface SemanticHit {
  report_id: string;
  query: string;
  companies: string[];
  summary: string;
  tags: string[];
  similarity: number;
}

export interface ReportsListResponse {
  items: Report[];
  semantic: SemanticHit[];
  limit: number;
  offset: number;
}

export interface CreateReportInput {
  title?: string;
  query: string;
  companies?: string[];
  tags?: string[];
  status?: ReportStatus;
  sourceCount?: number;
  durationMs?: number;
  summary?: string;
  sections?: ReportSections;
}

export interface UpdateReportInput {
  title?: string;
  tags?: string[];
}
