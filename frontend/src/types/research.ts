import type { ReportSections } from './index';

export interface AgentStep {
  step: string;
  tool?: string;
  progress: number;
  durationMs?: number;
  startedAt: number;
  completedAt?: number;
}

export interface CompleteEvent {
  report_id: string;
  duration_ms: number;
  tools_used: string[];
  companies: string[];
  progress: number;
}

export interface ResearchState {
  status: 'idle' | 'streaming' | 'complete' | 'error';
  sections: ReportSections;
  agentSteps: AgentStep[];
  progress: number;
  companies: string[];
  toolsUsed: string[];
  reportId: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface MarketSectionData {
  data?: Record<string, MarketCompanyData>;
  narrative?: string;
  key_insights?: string[];
  sources?: string[];
}

export interface MarketCompanyData {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  eps: number | null;
  revenue: number | null;
  revenue_growth: number | null;
  gross_margins: number | null;
  profit_margins: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  volume: number | null;
  beta: number | null;
  sector?: string;
  industry?: string;
  description?: string;
  history?: Array<{ date: string; close: number; volume?: number | null }>;
  source?: string;
  source_url?: string;
}

export interface NewsArticle {
  title: string;
  description?: string;
  url?: string;
  source?: string;
  published_at?: string;
  source_type?: string;
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'neutral' | 'negative';
}

export interface NewsSentimentEntry {
  score?: number | null;
  score_0_100?: number | null;
  label?: 'positive' | 'neutral' | 'negative';
  positive?: number;
  neutral?: number;
  negative?: number;
}

export interface NewsSectionData {
  articles?: NewsArticle[];
  sentiment_by_company?: Record<string, NewsSentimentEntry>;
  narrative?: string;
  sources?: string[];
}

export interface FilingPassage {
  text: string;
  relevance_score?: number;
  source?: string;
  source_url?: string;
  ticker?: string;
  metadata?: {
    ticker?: string;
    filing_type?: string;
    period?: string;
    section_name?: string;
    source_url?: string;
  };
}

export interface FilingsSectionData {
  passages?: FilingPassage[];
  recent_8k_by_ticker?: Record<string, Array<{ form?: string; filed?: string; url?: string; description?: string }>>;
  narrative?: string;
  sources?: string[];
}

export interface SocialTickerData {
  google_trends?: {
    values?: number[];
    dates?: string[];
    current_score?: number | null;
  };
  reddit_posts?: Array<{
    title: string;
    score: number;
    upvote_ratio: number;
    num_comments: number;
    url: string;
    subreddit: string;
  }>;
  reddit_mention_count?: number;
  reddit_avg_score?: number;
  source?: string;
}

export interface SocialSectionData {
  data?: Record<string, SocialTickerData>;
  narrative?: string;
  sources?: string[];
}

export interface SynthesisSectionData {
  summary?: string;
  comparison_table?: Array<Record<string, string | number>>;
  key_findings?: string[];
  recommendation?: string;
}

export interface RiskItem {
  risk: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

export type RisksSectionData = RiskItem[];
