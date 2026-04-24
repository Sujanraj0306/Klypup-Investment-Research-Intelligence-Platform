# Architecture Decisions Record
## Klypup Investment Research Platform

Each ADR captures a decision that shaped what shipped, what got rejected, and the trade-offs that came with it. Status is **Accepted** unless otherwise noted.

---

### ADR-001: Google ADK over LangChain for agent orchestration

**Context.** Phase 3 needed an agent that can look at a natural-language query and decide which of 5 tools to call (market data, news, SEC RAG, social, web scrape). LangChain, LlamaIndex, and hand-rolled prompting were all on the table.

**Decision.** Use Google's `google-adk` package as the primary orchestration layer, with a hand-rolled heuristic fallback when `GEMINI_API_KEY` isn't configured.

**Reasoning.**
- ADK hooks directly into Gemini tool calling without an adapter layer. Function signatures turn into tool schemas automatically.
- Streaming events expose `tool_call` / `final_response` types so the UI can show "Fetching market data…" as it happens, not just at the end.
- Two-path design in [research_agent.py](backend/app/agent/research_agent.py): ADK when Gemini is available, otherwise a deterministic classifier (`_classify_tools`) + direct dispatch. This means the demo still works end-to-end without an API key — just with less nuanced synthesis.

**Trade-offs.**
- Smaller community than LangChain; fewer Stack Overflow answers when something breaks.
- Locks the project to Gemini as the LLM. Swapping to Claude or GPT-4 would require replacing the agent layer entirely.
- `google-adk 0.5.0` forced a round of upgrades in the rest of the stack (fastapi 0.110→0.115, uvicorn 0.29→0.34, httpx 0.27→0.28, supabase 2.9→2.18, pydantic-settings 2.2→2.5) because the ADK pulls in stricter version floors.

---

### ADR-002: ChromaDB in-process vs a hosted vector DB (Pinecone / Weaviate)

**Context.** SEC filings are chunked to ~600 tokens and need similarity search. Free tiers of Pinecone (1 index) and Weaviate Cloud (1 cluster) are usable but add a second network hop.

**Decision.** ChromaDB `PersistentClient` running in-process on the FastAPI server, data stored at `./chroma_db/`.

**Reasoning.**
- Zero additional cost — no API key to manage.
- No network latency — queries stay inside the process, returning in single-digit milliseconds.
- Simpler blast radius — one service to deploy instead of two.
- Graceful embedding fallback in [rag_service.py](backend/app/services/rag_service.py): if `GEMINI_API_KEY` isn't set, Chroma falls back to its bundled sentence-transformers embedder so ingestion still works.

**Trade-offs.**
- Chroma collection sits on the container's ephemeral disk. For Cloud Run we either mount GCS FUSE or rebuild the collection on cold start. The current Dockerfile ships with an empty collection; a real deploy mounts a volume or bakes the prebuilt DB into the image.
- Can't scale the vector store independently of the API.
- Memory footprint of the loaded HNSW index grows with ingestion.

---

### ADR-003: Supabase pgvector for report semantic search, Firestore for everything else

**Context.** The app needs two kinds of storage: operational (watchlists, reports, users) and semantic (report embeddings for similarity search). Firestore is fantastic for the first but has no vector search.

**Decision.** Firestore for all structured data + Supabase Postgres with the `pgvector` extension for report embeddings.

**Reasoning.**
- Firestore real-time listeners + path-scoped security rules map cleanly onto the multi-tenant `/orgs/{orgId}/…` layout.
- pgvector's `<=>` cosine operator + Supabase RPC (`match_reports`) gives us a single-query semantic search with SQL-level RLS.
- Both are free for demo scale.
- Graceful degradation: when Supabase isn't configured, [embeddings.py](backend/app/core/embeddings.py) no-ops and [reports.py](backend/app/api/reports.py) falls back to a keyword substring match so Phase 2 search still returns results.

**Trade-offs.**
- Two write paths on report create/update/delete — can drift if either write fails. The current code wraps the Supabase write in a fire-and-forget `asyncio.create_task` to avoid blocking the response, at the cost of eventual (not immediate) consistency.
- Second database to maintain and pay for at scale.
- `supabase 2.9.1` pinned httpx<0.28 which clashed with google-genai's httpx≥0.28.1 — forced a bump to `supabase==2.18.1`.

---

### ADR-004: Firebase Auth + Firestore for operational data

**Context.** Needed auth (Google SSO + email/password), real-time reads for the watchlist, and per-org isolation. Options: Firebase, Supabase Auth + RLS, or Clerk + custom Postgres.

**Decision.** Firebase Auth on the frontend, Firebase Admin SDK on the backend, Firestore for data.

**Reasoning.**
- One SDK on the frontend handles both auth and data listeners.
- Google SSO works with zero extra config once the Firebase project is set up.
- `firebase_admin.auth.verify_id_token` is battle-tested for bearer auth — the backend never sees passwords.
- Free tier (Spark plan) covers auth + Firestore + Hosting.

**Trade-offs.**
- Firestore has no joins. Every denormalization that fixes that (e.g. duplicating `companies` onto reports for list views) adds write complexity.
- 1 MB per-document limit. For the research agent's `sections` blob this has been fine so far, but long filings passages need to go to Supabase or Cloud Storage.
- Org membership uses a `defaultOrg` field on `/users/{uid}` rather than a Firebase custom claim — chosen because setting custom claims requires a separate admin call from the backend, and `defaultOrg` is the only field that mattered. The new `CurrentOrgUser` dependency in [api/auth.py](backend/app/api/auth.py) resolves it once per request.

---

### ADR-005: Server-Sent Events (SSE) over WebSockets for streaming

**Context.** A full research run takes 20–60 seconds. The user has to see progress (`"Fetching news…"`) and partial results (`market` section arriving before `synthesis`) or the wait feels broken.

**Decision.** SSE end-to-end — `sse-starlette` on the backend, a hand-rolled parser in [lib/api.ts](frontend/src/lib/api.ts) on the frontend.

**Reasoning.**
- SSE is unidirectional, which is exactly what the research stream is — the backend pushes, the client reads.
- Auth works with the existing Bearer token over POST (`fetch` + `ReadableStream`). WebSockets don't support the `Authorization` header and need subprotocol hacks to pass a token.
- Auto-reconnect is built in if we switched to `EventSource` — we currently use `fetch` because `EventSource` is GET-only and can't pass a request body.
- Same event contract (`agent_step` / `section` / `complete` / `error`) is reused by both [research.py](backend/app/api/research.py) and the new [compare.py](backend/app/api/compare.py) endpoints.

**Trade-offs.**
- Can't receive mid-stream input from the client (not needed for research, but we'd need WebSockets if we ever added a "ask a follow-up" mode).
- Cloud Run's 60-minute max request timeout is fine today but would be a ceiling for longer analyses.
- Our parser buffers `data:` lines across `\n\n` boundaries manually — had to rewrite it in Phase 3 to also track the `event:` name, which the Phase 2 stub ignored.

---

### ADR-006: yfinance primary, FMP supplementary for market data

**Context.** Need live quotes, 30-day history, fundamentals, and sector ETF performance. Official Yahoo Finance API doesn't exist; Alpha Vantage and FMP free tiers are rate-limited (5 req/min, 250 req/day respectively).

**Decision.** `yfinance` as primary source, Financial Modeling Prep as optional supplement for structured quarterly revenue and earnings history.

**Reasoning.**
- Completely free, no API key.
- One call returns everything: price, history, info, financials.
- When FMP is configured, [_fmp_supplement](backend/app/agent/tools.py) adds quarterly_revenue + earnings_history onto the market data. When it isn't, the tool keeps working.
- All yfinance calls run through `asyncio.to_thread` so the event loop stays free, and a TTL cache in [core/cache.py](backend/app/core/cache.py) keeps calls under control (5 min for quotes, 10 for movers, 15 for sectors).

**Trade-offs.**
- yfinance is unofficial — Yahoo can break it with a page redesign.
- Data fields are sometimes missing or stale. Our `_safe_num` helper treats NaN/None uniformly.
- Not appropriate for high-frequency or production trading use cases. For that, we'd swap in a paid provider.

---

### ADR-007: TextBlob + optional Gemini for news sentiment

**Context.** Each research run pulls 10–20 articles per company and needs a sentiment label per article plus an aggregate score.

**Decision.** TextBlob runs locally for per-article polarity (fast, free, deterministic); Gemini provides the narrative synthesis that reads the aggregate in context.

**Reasoning.**
- TextBlob is ~0 cost — nothing leaves the server, nothing gets rate-limited.
- "neutral / positive / negative" labels come from a simple threshold on polarity (±0.1), which is good enough for a color-coded dot on each article.
- Gemini handles the interpretive layer (the synthesis section), so the combination is "cheap classification + expensive interpretation" rather than "expensive classification + expensive interpretation".

**Trade-offs.**
- TextBlob is general-purpose and misreads financial jargon: "beat earnings" reads as neutral when it's a clearly positive signal.
- Doesn't understand negation or irony well.
- A finance-tuned model (FinBERT) would be strictly better but requires ~400MB of additional dependencies on the Cloud Run image.

---

### ADR-008: Multi-tenant isolation — defense in depth

**Context.** Any user with an auth token must only see their org's data. Security is the class of thing where a single missed check is a breach.

**Decision.** Three concurrent layers of isolation:
1. **Firestore security rules** — path-based rules deny reads/writes when the path `orgId` doesn't match the request's `uid`.
2. **API-layer `CurrentOrgUser` dependency** — every org-scoped route goes through [api/auth.py](backend/app/api/auth.py) which resolves the user's `defaultOrg` and stamps it on the request.
3. **Supabase Row Level Security** — the `report_embeddings` table has RLS policies so even if someone bypasses the API, the database refuses to leak rows from another org.

**Reasoning.**
- No single layer is trusted to be correct. The Firestore rules catch direct-SDK bypasses; the API layer catches backdoor admin access; RLS catches both.
- Layered checks make future refactors safer — a bug in one layer gets caught by another.
- `orgId` resolution is cached in-request (dependency injection) so the Firestore round-trip only happens once per call.

**Trade-offs.**
- Three systems to keep in sync when the data model changes.
- The `defaultOrg` field on `/users/{uid}` is the source of truth and has no backup — if it's corrupted, the user locks themselves out. A real deployment would add a `memberships` subcollection for multi-org users.
- Firebase ID tokens don't carry the `orgId` claim today; every request pays a Firestore read to resolve it. Moving to custom claims would eliminate that read but adds an admin call at user-creation time.

---

### ADR-009: Fallback paths over hard failures

**Status.** Accepted

**Context.** This is a demo platform that has to boot and be usable without every credential set. Gemini, Supabase, Reddit, NewsAPI, GNews, and FMP all cost money or require approval — a reviewer should be able to clone the repo, run `npm install && pip install`, and see something work.

**Decision.** Every optional integration degrades silently.

**Reasoning.**
- Research agent without `GEMINI_API_KEY` → runs the heuristic orchestrator in [research_agent.py](backend/app/agent/research_agent.py), still streams sections, still saves a report.
- News tool without `NEWS_API_KEY` / `GNEWS_API_KEY` → empty article list, aggregate sentiment = neutral.
- Reddit tool without credentials → empty posts array, Google Trends still runs.
- Supabase without URL/key → semantic search returns `[]`, reports API falls back to keyword substring match.
- RAG without ingested filings → `query_sec_filings` returns an empty `rag_passages` array and the UI shows a "run the ingest script" hint.

**Trade-offs.**
- Silent degradation can mask real outages. Every fallback branch logs a warning, but the UI sometimes just shows "no articles found" whether the key is missing or the upstream is down. A production deployment should surface the difference in an admin panel.
- More branches = more surface area to test. Mitigated by keeping the branching at the tool/service boundary, not inside the agent logic.

---

### Appendix — dependency compatibility log

- `google-adk==0.5.0` depends on `fastapi>=0.115`, `uvicorn>=0.34`, `google-genai` (needs `httpx>=0.28.1`).
- `supabase 2.9.1` had `httpx<0.28` — bumped to `2.18.1`.
- `pydantic-settings 2.2.0` → `2.5.2` (required by `mcp` pulled in via ADK).
- `google-adk` imports `deprecated` without declaring it — added explicit pin.
- FastAPI 0.115 still fails at import time on `async def foo() -> None` + `status_code=204` when `from __future__ import annotations` is active. Workaround: drop the return annotation and pass `response_model=None` explicitly (see [watchlist.py](backend/app/api/watchlist.py)).
