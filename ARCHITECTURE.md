# Klypup — Architecture

> Companion to [DECISIONS.md](./DECISIONS.md). Where DECISIONS explains *why*,
> this document explains *what* — components, data flow, and the key
> sequences a reviewer should understand in five minutes.

---

## 1. System overview

```
                       ┌───────────────────────────┐
                       │         Browser           │
                       │ React + Vite + TS (dark)  │
                       │ Tailwind + Recharts + D3  │
                       │ Web Speech API (STT/TTS)  │
                       └────┬──────────────┬───────┘
               Firebase SDK │              │ REST + SSE
        (ID token + Google) │              │ all /api/* calls
                            ▼              ▼
                  ┌────────────────┐   ┌──────────────────────────────┐
                  │ Firebase Auth  │   │   FastAPI + Uvicorn (Py3.12) │
                  │ (Google + E/P) │   │                              │
                  └────────────────┘   │  ┌───────────────────────┐   │
                                       │  │    API layer          │   │
                                       │  │  auth / market /      │   │
                                       │  │  research / compare / │   │
                                       │  │  reports / watchlist /│   │
                                       │  │  chat                 │   │
                                       │  └──────────┬────────────┘   │
                                       │             │                │
                                       │  ┌──────────▼────────────┐   │
                                       │  │   Research agent      │   │
                                       │  │ Gemini 2.5 Flash +    │   │
                                       │  │ function-calling      │   │
                                       │  │ dispatcher            │   │
                                       │  └──────┬──────────┬─────┘   │
                                       │         │          │         │
                                       │         ▼          ▼         │
                                       │  ┌───────────┐ ┌─────────┐   │
                                       │  │ 6 Tools   │ │ Shared  │   │
                                       │  │ market    │ │ cache + │   │
                                       │  │ news      │ │ helpers │   │
                                       │  │ filings   │ │         │   │
                                       │  │ social    │ └─────────┘   │
                                       │  │ web_scrape│               │
                                       │  │ web_search│               │
                                       │  └───────────┘               │
                                       └────┬────────┬────────┬──────┘
                                            │        │        │
                   ┌────────────────────────┼────────┼────────┼────────────┐
                   ▼                        ▼        ▼        ▼            ▼
         ┌──────────────────┐     ┌───────────┐ ┌───────┐ ┌────────┐ ┌─────────────┐
         │  External APIs   │     │ Firestore │ │Supabase│ │ ChromaDB│ │  Gemini API │
         │                  │     │ (users/   │ │pgvector│ │(SEC RAG)│ │ 2.5 Flash + │
         │ FMP /stable/*    │     │  orgs/    │ │semantic│ │in-process│ │ Google      │
         │ yfinance (fallbk)│     │  reports/ │ │ search │ │         │ │ Search      │
         │ Alpha Vantage    │     │  watchlist│ │        │ │         │ │ grounding   │
         │ NewsAPI + GNews  │     │  chat ctx)│ │        │ │         │ │             │
         │ Reddit (PRAW)    │     └───────────┘ └────────┘ └─────────┘ └─────────────┘
         │ Google Trends    │
         │ SEC EDGAR        │
         └──────────────────┘
```

---

## 2. Layers

### 2.1 Frontend (Vite + React 18 + TS)

```
frontend/src/
├── components/
│   ├── auth/          Login, Signup, AuthGuard
│   ├── layout/        Sidebar, TopBar, AppShell
│   ├── dashboard/     DashboardPage, SectorHeatmap (D3 treemap),
│   │                  MarketMovers, QuickActions
│   ├── research/      ResearchPage, QueryInput (voice + validation),
│   │                  AgentStatusPanel, ReportStreamView, ChatFollowup
│   ├── report/        MarketSection (cards + Recharts area chart),
│   │                  NewsSection (article list + sentiment gauge SVG),
│   │                  FilingsSection, SocialSection,
│   │                  SynthesisSection (markdown + read-aloud),
│   │                  RisksSection (severity grid), SourceChip
│   ├── watchlist/     WatchlistPage (drag-reorder), WatchlistCard, AddCompany
│   ├── reports/       ReportsPage (keyword + semantic search, tag filter),
│   │                  ReportDetailPage
│   ├── compare/       ComparePage + CompanySelector + 5 comparison sections
│   └── ui/            Button, Card, Badge, Spinner, Input, Toast,
│                      Skeleton, ErrorBoundary
├── hooks/             useAuth, useMarketData, useWatchlist, useReports,
│                      useResearch (SSE), useCompare (SSE), useDebounced,
│                      useKeyboardShortcuts
└── lib/
    ├── api.ts         Fetch wrapper + SSE parser (handles \r\n\r\n)
    ├── firebase.ts    Firebase client SDK
    ├── supabase.ts    Supabase client (anon key; used only for types today)
    ├── format.ts      Number/date formatting
    ├── speechUtils.ts Web Speech API wrappers
    └── heatmapScale.ts D3 color scales
```

### 2.2 Backend (FastAPI 0.115 + Uvicorn + Python 3.12)

```
backend/
├── main.py                  App entry; logging + telemetry-mute config;
│                             registers 7 routers under /api
├── app/
│   ├── api/                 Route handlers
│   │   ├── auth.py          Token verification + get_current_org dep
│   │   ├── market.py        /quote /history /sector-heatmap /movers /search
│   │   ├── research.py      /stream (SSE) /quick-quote /rag-stats
│   │   ├── compare.py       /stream (SSE) — 2-4 company comparison
│   │   ├── reports.py       CRUD + semantic search
│   │   ├── watchlist.py     CRUD + reorder
│   │   ├── chat.py          /followup (SSE) — chat on completed report
│   │   └── health.py        /health (unauthed)
│   ├── agent/
│   │   ├── research_agent.py  Gemini dispatcher → tools → synthesis
│   │   └── tools.py           6 tools: market / news / filings RAG /
│   │                          social / web_scrape / web_search
│   ├── core/
│   │   ├── config.py        pydantic-settings Settings
│   │   ├── cache.py         TTL cache
│   │   ├── market.py        FMP → yfinance → Alpha Vantage cascade
│   │   ├── embeddings.py    Gemini embeddings + Supabase upsert/search
│   │   ├── firebase_admin.py Firebase Admin init
│   │   ├── firestore_client.py Collection helpers
│   │   └── supabase_client.py Service-role client
│   └── services/
│       └── rag_service.py   ChromaDB wrapper (telemetry disabled)
└── scripts/
    └── ingest_filings.py    Fetch SEC filing → chunk → embed → upsert ChromaDB
```

### 2.3 Stores

| Store | Role | Multi-tenant isolation |
|---|---|---|
| **Firestore** | Users (`/users/{uid}`), orgs (`/orgs/{orgId}`), watchlist (`/orgs/{orgId}/watchlist/{symbol}`), reports (`/orgs/{orgId}/reports/{id}`) | Firestore path rules match `request.auth.uid` against `orgId` |
| **Supabase Postgres + pgvector** | `report_embeddings(org_id, report_id, query, companies, summary, tags, embedding vector(3072))`, `match_reports` RPC for cosine similarity | RLS policies; service role used backend-only |
| **ChromaDB (in-process)** | SEC filing chunks, ingested by `scripts/ingest_filings.py` | Single-tenant per deploy; chunks are public domain |
| **TTL cache (in-process)** | Quote/history/movers/heatmap hot paths | Keyed by (endpoint, symbol); isolated by process |

### 2.4 External providers and fallback chains

| Need | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Single quote | FMP `/stable/quote` | yfinance `.info` + history | Alpha Vantage `GLOBAL_QUOTE` |
| Sector heatmap | FMP `/stable/sector-performance-snapshot` | yfinance batch download | Alpha Vantage per-ETF |
| Market movers | FMP `/stable/biggest-gainers` + `/biggest-losers` | yfinance batch over 50-name universe | — |
| TTM ratios | FMP `/stable/ratios-ttm` | yfinance `.info` fundamentals | — |
| News | NewsAPI | GNews | — |
| Sentiment | TextBlob polarity | — | — |
| Social | Reddit PRAW + pytrends | — | — |
| Filings | ChromaDB RAG + SEC EDGAR 8-K search | — | — |
| Web / grounding | Gemini 2.5 Flash + `google_search` grounding | Playwright `web_scrape` | — |

---

## 3. Sequence diagrams

### 3.1 Research query (the hot path)

```
  User     Frontend        Backend /api/research/stream        Gemini         Tools            Firestore   Supabase
   │         │                       │                           │              │                 │           │
   │  type   │                       │                           │              │                 │           │
   │  query  │                       │                           │              │                 │           │
   ├────────▶│                       │                           │              │                 │           │
   │         │ POST SSE /stream      │                           │              │                 │           │
   │         ├──────────────────────▶│                           │              │                 │           │
   │         │                       │ agent_step 5%             │              │                 │           │
   │         │◀──────────────────────┤                           │              │                 │           │
   │         │                       │ dispatch prompt + tool    │              │                 │           │
   │         │                       │  declarations             │              │                 │           │
   │         │                       ├──────────────────────────▶│              │                 │           │
   │         │                       │◀── tool_calls ────────────┤              │                 │           │
   │         │                       │ agent_step 12-80%         │              │                 │           │
   │         │◀──────────────────────┤                           │              │                 │           │
   │         │                       │ run tools in order        │              │                 │           │
   │         │                       ├───────────────────────────────────────── │                 │           │
   │         │                       │  get_market_data(NVDA)   │               │                 │           │
   │         │                       │  get_news_and_sentiment  │               │                 │           │
   │         │                       │  query_sec_filings       │               │                 │           │
   │         │                       │  web_search (if no ticker│               │                 │           │
   │         │                       │◀──── results ───────────────────────────┤                 │           │
   │         │                       │ synthesis prompt + tool   │              │                 │           │
   │         │                       │   results                 │              │                 │           │
   │         │                       ├──────────────────────────▶│              │                 │           │
   │         │                       │◀── JSON report ───────────┤              │                 │           │
   │         │ section x6            │                           │              │                 │           │
   │         │◀──────────────────────┤ (market, news, filings,   │              │                 │           │
   │         │                       │  social, synthesis, risks)│              │                 │           │
   │         │                       │ save report               │              │                 │           │
   │         │                       ├──────────────────────────────────────────────────────────▶│           │
   │         │                       │◀── reportId ──────────────────────────────────────────────┤           │
   │         │                       │ (fire-and-forget) embed + upsert                                      │
   │         │                       ├──────────────────────────────────────────────────────────────────────▶│
   │         │ complete(reportId)    │                                                                       │
   │         │◀──────────────────────┤                                                                       │
   │ render  │                       │                                                                       │
   │◀────────┤                       │                                                                       │
```

### 3.2 Semantic report search

```
  User     Frontend                 Backend /api/reports?q=…            Gemini               Supabase               Firestore
   │         │                              │                              │                     │                       │
   ├ type ──▶│                              │                              │                     │                       │
   │         │ GET /api/reports?q=GPU…      │                              │                     │                       │
   │         ├─────────────────────────────▶│                              │                     │                       │
   │         │                              │ embed(q, retrieval_query)    │                     │                       │
   │         │                              ├─────────────────────────────▶│                     │                       │
   │         │                              │◀── 3072-dim vector ──────────┤                     │                       │
   │         │                              │ match_reports(vector, orgId) │                     │                       │
   │         │                              ├───────────────────────────────────────────────────▶│                       │
   │         │                              │◀── [ {report_id, similarity} … ] ──────────────────┤                       │
   │         │                              │ hydrate full reports by id                                                 │
   │         │                              ├──────────────────────────────────────────────────────────────────────────▶│
   │         │                              │◀── full report docs ─────────────────────────────────────────────────────┤
   │         │ [{ title, tags, …}, …]        │                                                                           │
   │ list    │◀─────────────────────────────┤                                                                           │
   │◀────────┤                                                                                                          │
```

### 3.3 Chat follow-up on a completed report

```
  User     Frontend              Backend /api/chat/followup          Gemini
   │         │                            │                            │
   ├ ask ──▶│                            │                            │
   │         │ POST { message, context }  │                            │
   │         ├───────────────────────────▶│                            │
   │         │                            │ build system prompt with   │
   │         │                            │  price/P-E/findings from   │
   │         │                            │  context; stream completion│
   │         │                            ├───────────────────────────▶│
   │         │ chunk … chunk … chunk      │◀── streamed text ──────────┤
   │         │◀───────────────────────────┤                            │
   │         │ done                       │                            │
   │         │◀───────────────────────────┤                            │
   │ render  │                                                         │
   │◀────────┤                                                         │
```

---

## 4. Multi-tenant isolation (defense in depth)

Three independent checks — any one failing still prevents a data leak:

1. **Firestore security rules** ([firestore.rules](./firestore.rules)) scope every
   read/write under `/orgs/{orgId}/**` to `request.auth.uid` matching the org
   id. The browser SDK simply cannot see another org's docs.
2. **Backend dependency** ([backend/app/api/auth.py](./backend/app/api/auth.py))
   verifies the Firebase ID token, resolves `orgId` from the `users/{uid}`
   document, and injects it as `CurrentOrgUser` into every protected route. No
   route reads `orgId` from the request body.
3. **Supabase RLS** on `report_embeddings` — only the service-role key
   (backend) can read/write. Even if someone fishes out an anon key, reads
   return zero rows.

Single-user-per-org model keeps `orgId = "org_" + uid`, so there is a trivial
path for future team seats by upgrading `/users/{uid}.defaultOrg` to a
lookup.

---

## 5. Streaming protocol

`research/stream`, `compare/stream`, and `chat/followup` all use
Server-Sent Events via `sse-starlette`. Event shapes:

```
event: agent_step
data: { "step": "...", "tool": "...", "progress": 5-100 }

event: section
data: { "section": "market"|"news"|..., "data": {...} }

event: complete
data: { "report_id": "...", "duration_ms": 12345, "tools_used": [...] }

event: error
data: { "message": "..." }
```

Client parser normalizes `\r\n\r\n` → `\n\n` before splitting, since
`sse-starlette` emits the spec-compliant `\r\n` form which is not what a
naïve parser would default to.

`useResearch` keeps a safety net: if the HTTP stream closes without delivering
a `complete` event (proxy buffering, stale client bundle, abort mid-flight),
the hook refetches `/api/reports?limit=1`, treats the most recent report as
the result, and still renders the report + chat panel.

---

## 6. Caching strategy

Central [core/cache.py](./backend/app/core/cache.py) — a tiny TTL dict, swap
for Redis when we horizontally scale.

| Key | TTL | Rationale |
|---|---|---|
| `quote:{SYMBOL}` | 5 min | FMP 250-req/day budget; most users revisit the same tickers |
| `history:{SYMBOL}:{period}:{interval}` | 5 min | Price sparklines shared across Watchlist + Report + Dashboard |
| `spark:{SYMBOL}` | 5 min | 7-day close series for watchlist cards |
| `sector-heatmap` | 15 min / 60 s | 15 min on success, negative-cache 60 s if empty so we retry sooner |
| `movers` | 10 min / 60 s | Same pattern — full-duration TTL only on success |

Bad-result backoff prevents thrashing when upstream is rate limited.

---

## 7. Trade-offs deliberately taken

Spelled out in [DECISIONS.md](./DECISIONS.md); the three that most affect a
reviewer's read of the code:

- **Two databases (Firestore + Supabase)** — Firestore can't do pgvector math;
  Supabase is read/written only by the backend and is optional.
- **Gemini function calling replaces Google ADK** — ADK 0.5 had an async
  session bug that silently killed tool dispatch; direct function calling
  proved more reliable and is still "agentic" (the model picks tools).
- **yfinance kept as fallback, not ripped out** — FMP free tier doesn't
  return sector/industry/description; yfinance fills those in when Yahoo
  isn't rate-limited. Stderr is redirected to avoid log noise.
