# Klypup — Business Case Study

> **Watch the 10-minute demo first** → **[youtu.be/7bVMFYfFz_A](https://youtu.be/7bVMFYfFz_A)**
>
> This document is the business-and-tech companion. The video shows the product working end-to-end; the text below explains *why it matters* and *what it costs to run*.

---

## 1. The problem

A sell-side research analyst at a mid-sized investment bank is asked a simple question on Monday morning: *"How is NVIDIA's Q3 looking vs AMD, and what are the biggest risks?"*

What actually happens next:

- **Day 1–2:** Pull prices, P/E, margins for the two companies from the Bloomberg Terminal. Copy numbers into a spreadsheet. Cross-check with Refinitiv or FactSet.
- **Day 2–3:** Read 40–60 news articles across Reuters, Bloomberg, WSJ. Tag sentiment manually.
- **Day 3–4:** Open the latest 10-Q on SEC EDGAR. Search for "risk factors", paste relevant passages, re-read three times.
- **Day 4–5:** Stitch everything into a Word doc, format a summary table, add citations, send to the PM.

By the time it lands, market conditions have already moved.

### Why it happens — the numbers

| What | Stat | Source |
|---|---|---|
| Share of analyst time spent on data gathering vs analysis | **~65%** of FP&A professionals' time goes to data collection + validation, only **35%** on insight | [FP&A Trends Survey 2024](https://fpa-trends.com/sites/default/files/docs/FPA-Trends-Survey-2024.pdf) |
| Cost of a single Bloomberg Terminal seat | **$31,980 / year** (single-seat list price, 2026) | [Bloomberg Terminal pricing 2026](https://godeldiscount.com/blog/bloomberg-terminal-cost-2026) |
| Global spend on financial market data | **$44.3 billion** in 2024 (grew 6.4% YoY) → **$49.2 billion** in 2025 | [Burton-Taylor via Finextra](https://www.finextra.com/newsarticle/45769/global-spending-on-financial-market-data-hits-443bn) |
| Productivity ceiling when analysts do use AI | Up to **80% time savings** on data collection, **50%** on analysis (Moody's Research Assistant pilot) | [Moody's pilot results, Microsoft 2025](https://www.microsoft.com/en-us/industry/blog/financial-services/2025/06/30/5-ways-ai-is-supercharging-research-in-financial-services/) |
| Schroders' analyst cycle time | "Two weeks to analyse a new company" → cut **in half** with AI tools | [Schroders public markets insights](https://www.schroders.com/en-lu/lu/individual/insights/how-we-re-using-ai-to-enhance-our-investment-edge-in-public-markets/) |
| Front-office productivity projection for top IBs | **27–35% gains** by 2026 | [Deloitte, cited in industry reviews](https://aimultiple.com/ai-financial-research) |

**So the industry pays ~$44 billion/year for data that humans still stitch together by hand.** Every hour an analyst spends on mechanical gathering is an hour they are not finding alpha.

---

## 2. The customer

| Who | What they do today | What they pay |
|---|---|---|
| Sell-side research analyst at a mid-market bank | Compiles coverage reports on 15–30 companies. Spends 2–5 days per refresh. | $30k/yr Bloomberg seat · ~60% of their salary goes to gathering |
| Buy-side analyst at a long-only fund | Screens 50+ tickers weekly. Needs sentiment + filings + competitor context. | $28k/yr per seat · 10+ hours/week of reading news |
| Family office principal | Tracks ~20 holdings. Wants a morning brief. Can't afford Bloomberg. | $0 (uses Yahoo) — leaves signals on the table |

The top two pay 5-figure annual seat licences and still spend most of their day copy-pasting. The third is priced out of professional tooling entirely.

---

## 3. Our solution — in one sentence

**Klypup turns a plain-English question into a cited, structured research report in 20–45 seconds, grounded in real market data, news, and SEC filings, delivered in a browser on any device.**

### Watch it happen

[![Klypup demo](https://img.youtube.com/vi/7bVMFYfFz_A/hqdefault.jpg)](https://youtu.be/7bVMFYfFz_A)

→ **[youtu.be/7bVMFYfFz_A](https://youtu.be/7bVMFYfFz_A)** *(10 min)*

---

## 4. Product walk-through (screenshots)

> Only the highlights are included. Watch the video for the full experience.

### 4.1 Sign in — Google SSO or email

Firebase-backed auth with per-organisation isolation baked into every API call.

![Login](../ScreenShort%20/LOGIN/Screenshot%202026-04-24%20at%204.15.04%20PM.png)

### 4.2 Dashboard — the morning brief

11 SPDR sector ETFs heatmapped live, top 5 gainers and losers, watchlist with sparklines. No terminal required.

![Dashboard](../ScreenShort%20/Dashboard/Screenshot%202026-04-24%20at%205.47.27%20PM.png)

### 4.3 Research — streaming, sourced, structured

Type a question in natural language. The agent picks which of its 6 tools to call, runs them in parallel, and streams sections into the UI as they finish. Every claim is cited.

![Research — streaming](../ScreenShort%20/Research/Screenshot%202026-04-24%20at%205.47.45%20PM.png)

![Research — structured sections](../ScreenShort%20/Research/Screenshot%202026-04-24%20at%205.49.17%20PM.png)

### 4.4 Compare — two to four companies side by side

Normalized 6-axis radar, sortable metrics table, news-sentiment bar chart, AI synthesis with investor-archetype matching ("growth buy," "value buy," "income buy").

![Compare](../ScreenShort%20/Compare%20Companies/Screenshot%202026-04-24%20at%205.51.10%20PM.png)

### 4.5 Reports archive — semantic search over your history

Past reports are embedded into Supabase + pgvector. Type *"GPU competitors"* and the NVIDIA-vs-AMD report surfaces even though that exact phrase isn't in the title.

![Reports](../ScreenShort%20/Reports/Screenshot%202026-04-24%20at%205.50.16%20PM.png)

### 4.6 Watchlist — your personal tickers

Drag-reorder, live prices, 7-day sparkline, sentiment chip per ticker. Persists per organisation.

![Watchlist](../ScreenShort%20/Watchlist/Screenshot%202026-04-24%20at%205.52.46%20PM.png)

---

## 5. How it works (the non-technical version)

```
          NATURAL LANGUAGE QUERY
                    │
                    ▼
       ┌────────────────────────────┐
       │    The agent decides:      │
       │ "What do I need to answer  │
       │      this question?"       │
       └──────────┬─────────────────┘
                  │
    ┌─────────────┼─────────────┬──────────────┬──────────────┐
    ▼             ▼             ▼              ▼              ▼
 Live prices   News &       SEC filings   Social        Live Google
 & ratios      sentiment    (semantic     signals       search
                            search)       (Reddit,      (grounded
                                         Trends)       w/ citations)
    │             │             │              │              │
    └─────────────┴─────┬───────┴──────────────┴──────────────┘
                        ▼
           ┌─────────────────────────────┐
           │   Synthesis: structured     │
           │   JSON report with          │
           │   cited sources             │
           └────────┬────────────────────┘
                    ▼
      ┌──────────────────────────────┐
      │ Market / News / Filings /    │
      │ Social / Synthesis / Risks   │
      │ — streamed to browser        │
      └──────────────────────────────┘
                    ▼
                 Analyst reads,
              asks follow-up in chat,
          saves to semantic archive
```

The agent is powered by **Gemini 2.5 Flash** from Google. It doesn't run a fixed pipeline — it picks tools based on the query. If you only ask about news, it doesn't waste time pulling filings.

---

## 6. Business impact

### 6.1 For the sell-side analyst
- **Time:** 2–5 day report cycle → **30–60 seconds to first draft**
- **Throughput:** 10–15 reports/month → **100+ reports/month** at the same headcount
- **Quality floor:** every claim is sourced; no more un-cited "revenue growth was strong"

### 6.2 For the firm
- **Coverage expansion:** same research team can cover 5–8x more tickers
- **Bloomberg-seat attrition:** not every analyst needs a terminal if live prices, filings, and news are in one searchable app
- **Compliance audit trail:** every report is saved with its tool calls and sources

### 6.3 For the user priced-out today
- **$0/month** personal free tier (our free-tier deploy uses Render + Firebase + free API keys — total run cost ~$0 for a demo)
- **One screen, mobile-ready**, no Bloomberg licence

---

## 7. Cost model (honest)

### 7.1 Infrastructure (per 1,000 research queries)

| Line item | Cost | Notes |
|---|---|---|
| Gemini 2.5 Flash (dispatcher + synthesis) | **~$0.60** | ~30k tokens in, ~4k tokens out per query at published API rates |
| Financial Modeling Prep | **$0** | Free tier covers up to 250 calls/day / analyst |
| NewsAPI + GNews | **$0** | Free tier |
| Firestore + Firebase Auth | **~$0.05** | Reads + writes per query, free tier usually covers |
| Supabase pgvector | **$0** | Free tier |
| Render (free tier) | **$0** | 750 hrs/mo free, sleeps after 15 min idle |
| **Total** | **≈ $0.65 / 1,000 queries** | No fixed terminal cost |

For comparison: one Bloomberg Terminal seat = **$31,980/yr**. A Klypup user running 100 queries/day for a year = **$23.70/yr** in marginal cost.

### 7.2 Unit economics at scale

| Tier | Price / user / month | Target margin | Target customer |
|---|---|---|---|
| Free | $0 | break-even | retail investors, students |
| Pro | $29 | 85% | family offices, boutique advisors |
| Team | $99 | 80% | buy-side funds <25 analysts |
| Enterprise | custom | custom | sell-side firms replacing 1 of 5 seat licences |

Even at $29/mo we are **1/90th** the cost of a Bloomberg seat.

---

## 8. Tech robustness — how it stays reliable

This section is deliberately short; the [ARCHITECTURE.md](../ARCHITECTURE.md) has the full breakdown. Four things matter most:

| Robustness theme | How we address it |
|---|---|
| **No single point of failure in data** | Every data domain has a fallback chain. Quotes: FMP → yfinance → Alpha Vantage. News: NewsAPI → GNews. Web context: Gemini Google grounding. If one provider is down, the report still renders. |
| **Multi-tenant isolation** | Three independent checks: Firestore path rules, backend `CurrentOrgUser` middleware, Supabase RLS. Any one failure still prevents a data leak. |
| **Streaming, not waiting** | Server-Sent Events push each section the moment it's ready. Users see progress at 5%, 12%, 34%, 48%, 88%, 100% — not a black box. |
| **Graceful degradation** | Missing API key → that tool is skipped, others still run. Gemini error → fallback heuristic orchestrator still produces a structured report. No silent failure. |

---

## 9. Security posture

- **Auth:** Firebase ID tokens, verified on every request. Google SSO + email/password.
- **Secrets:** no keys in source; `.env` files gitignored; production secrets live in the cloud provider's secret store.
- **Data:** at-rest encryption on Firestore and Supabase (providers default). TLS end-to-end.
- **Least privilege:** Supabase anon key is RLS-locked; service role lives only in the backend.
- **Audit:** every report keeps a `tools_used` list and `duration_ms` — traceable from answer back to sources.

---

## 10. Road-map — the next 90 days

| Milestone | Outcome |
|---|---|
| Live earnings-call transcripts (AlphaSense-style) | Extend RAG corpus from 10-Ks to transcripts |
| Agent memory across queries | "Compare this to Tuesday's run" |
| Scheduled research runs | Weekly auto-refresh of coverage reports |
| Slack + email delivery | Reports where analysts actually work |
| Custom model routing | Haiku for simple queries, Sonnet for deep synthesis, cost drops further |
| Admin analytics | Firm-level view of token spend, analyst activity, coverage heatmap |

---

## 11. Summary

- The analyst problem is **time**, not data. Data is a $44 B industry. Time is what the product gives back.
- Klypup is a **browser-based research agent** that answers NL queries in under a minute with sourced, structured reports.
- It's built on **free or near-free infrastructure** — a Bloomberg Terminal costs **~1,000×** more than the marginal cost of Klypup.
- The demo is at **[youtu.be/7bVMFYfFz_A](https://youtu.be/7bVMFYfFz_A)**. Code, architecture docs, and deploy instructions are in this repo.

---

### Further reading (inside this repo)

- [README.md](../README.md) — what's built, how to run it locally
- [ARCHITECTURE.md](../ARCHITECTURE.md) — component + data-flow diagrams, sequence diagrams, caching strategy
- [DECISIONS.md](../DECISIONS.md) — nine architecture decisions and why
- [docs/DEPLOY_FREE.md](./DEPLOY_FREE.md) — 25-minute free-tier deploy (Render + Firebase)
- [docs/SUPABASE_SETUP.md](./SUPABASE_SETUP.md) — connect Supabase pgvector in 5 minutes
