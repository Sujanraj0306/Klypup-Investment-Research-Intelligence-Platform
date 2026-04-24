# Supabase setup (5 minutes)

## What Supabase is and why this project uses it

**Supabase** is managed Postgres with a few batteries attached (auth, storage,
realtime, edge functions). The feature that matters here is the built-in
**pgvector** extension, which lets Postgres store and search embedding vectors.

### Our split-brain storage model

Klypup uses two databases by design, each for what it is best at:

| Store | What lives there | Why |
|---|---|---|
| **Firestore** | Users, orgs, watchlist, **saved research reports** (the source of truth), tags | Simple auth integration, realtime reads, easy path-based multi-tenant rules. |
| **Supabase (Postgres + pgvector)** | A **copy** of each report's `{query, summary, companies}` plus a 3072-dim Gemini embedding | Postgres + pgvector gives us one SQL query for cosine-similarity semantic search. Firestore can't do vector math. |

When a user saves a research report:

1. The report goes into Firestore at `/orgs/{orgId}/reports/{reportId}` (canonical).
2. A background task embeds the report's text with `gemini-embedding-001` and
   upserts a row into Supabase `public.report_embeddings`, keyed by the same
   `report_id` (see [backend/app/core/embeddings.py](../backend/app/core/embeddings.py)).

When the user searches reports semantically ("show me my research on GPU
competitors"), the frontend calls the backend, the backend embeds the search
text, calls the `match_reports` RPC on Supabase, gets back the top-N matching
`report_id`s with similarity scores, then hydrates the full reports from
Firestore.

If Supabase isn't configured, semantic search returns an empty list and
keyword search still works. **Supabase is optional** — the rest of the app
runs fine without it.

---

## Setup — 5 steps

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is enough).
2. **New project** → pick any name (e.g. `klypup`), pick a region close to you,
   set a DB password (you won't need it again).
3. Wait ~1 minute for the project to provision.

### 2. Grab two secrets

From your new project's dashboard:

- **Settings → API**:
  - `Project URL` → copy the `https://xxxxx.supabase.co` value
  - `service_role` key (labeled "secret") → copy it. **Backend only** — never expose to the browser.
  - `anon / public` key → copy it. This one is safe in the frontend.

### 3. Run the migration

1. **SQL Editor → New query**.
2. Open [migrations/supabase_init.sql](../migrations/supabase_init.sql) in
   this repo and paste the whole file.
3. Click **Run**.

You should see `Success. No rows returned` and, in the left-hand Table Editor,
a new `report_embeddings` table.

### 4. Wire the keys into your env files

Edit [backend/.env](../backend/.env):

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...   # the service_role key from step 2
```

Edit [frontend/.env.local](../frontend/.env.local):

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...   # the anon key from step 2
```

### 5. Restart + verify

```bash
# backend
cd backend && .venv/bin/uvicorn main:app --reload

# frontend (in another shell)
cd frontend && npm run dev
```

**Smoke test:**

1. Run any research query in the UI. Wait for it to complete and save.
2. Open the Supabase Table Editor → `report_embeddings` → you should see a new
   row with your `org_id`, `report_id`, and a vector (shown as `[0.012, -0.033, …]`).
3. Go to `/reports` in the UI and type a **semantic** query ("GPU competitors"
   even if the exact words aren't in any report). The matching report should
   rank higher than unrelated ones.

---

## How to verify it's working from the terminal

If the UI isn't cooperating, run this from `backend/`:

```bash
.venv/bin/python -c "
from app.core.supabase_client import get_supabase
c = get_supabase()
print('Supabase client:', 'OK' if c else 'MISSING URL/KEY')
if c:
    r = c.table('report_embeddings').select('report_id', count='exact').limit(1).execute()
    print('rows in table:', r.count)
"
```

- `Supabase client: MISSING URL/KEY` → env vars not loaded, restart uvicorn after editing `.env`.
- `Supabase client: OK` + `rows in table: 0` → connected, just no reports yet.
- `rows in table: >0` → fully working.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `extension "vector" is not available` when running the SQL | Very old Supabase project (rare in 2026) | Upgrade the project database from Settings → Infrastructure, or spin up a fresh project. |
| `column "embedding" ... type "vector(3072)"` error | pgvector < 0.7.0 | Supabase auto-upgrades; if self-hosting, `alter extension vector update;` |
| Reports save to Firestore but no rows ever appear in Supabase | `GEMINI_API_KEY` missing → embedding returns `None` → upsert is skipped | Set `GEMINI_API_KEY` in `backend/.env` and restart. |
| Semantic search always returns `[]` even with rows present | Frontend calling Supabase directly without the service key | Don't — semantic search goes through the backend. Check `frontend/src/hooks/useReports.ts` is calling `/api/reports/semantic-search` not Supabase directly. |
| `Failed to send telemetry event` — wait, that's a different tool | ChromaDB, not Supabase | Already silenced in `main.py`. |
