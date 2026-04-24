# Free-tier deploy (Render + Firebase Hosting)

Total time: ~25 minutes. Cost: **$0/month**.

- **Backend** → Render free web service (750 hrs/mo, sleeps after 15 min)
- **Frontend** → Firebase Hosting free (10 GB storage, 360 MB/day bandwidth)
- **Databases** → Firestore + Supabase (both free tiers, already in use)

## Known limits on the free tier

| Limit | Impact | Mitigation |
|---|---|---|
| Render free service sleeps after 15 min idle | First request after idle = **~30-60s cold start** | Hit `/api/health` from a free uptime-robot every 10 min, or upgrade to $7/mo Starter. For a graded demo review — totally acceptable. |
| Render free filesystem is ephemeral | ChromaDB RAG resets to empty on each cold boot | Filings section shows "no passages" until re-ingested. `query_sec_filings` degrades gracefully — the report still renders. Run the ingest script post-deploy if you want RAG live during demo (see "Warm up the RAG" below). |
| Render free: 512 MB RAM | No room for Playwright (~400 MB) | Dockerfile skips Playwright by default (`INSTALL_PLAYWRIGHT=0`). The `web_scrape` tool disables itself; no other tool uses it. |
| Firebase Hosting 360 MB/day outbound | The bundle is ~420 KB gzipped → ~850 page loads/day before you hit the cap | Not a real constraint for a demo. |

---

## Prerequisites

```bash
# Firebase CLI (once)
npm i -g firebase-tools
firebase login

# Verify you're on the right project
firebase projects:list
firebase use klypup
```

Render needs no CLI — it's dashboard-driven.

---

## Step 1 — Push the repo to GitHub

Render imports from GitHub. If the repo isn't on GitHub yet:

```bash
# from the repo root
gh repo create klypup --private --source=. --push   # one-liner with gh CLI
# or: create a repo on github.com, then:
#   git remote add origin git@github.com:<you>/klypup.git
#   git push -u origin main
```

## Step 2 — Deploy the backend to Render

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect your GitHub repo. Render reads [render.yaml](../render.yaml) and
   proposes one service: `klypup-api`.
3. Click **Apply**. Render starts building the Docker image (~5-8 min first time).
4. While it builds, set the secrets — **Dashboard → klypup-api → Environment**:

    | Key | Value |
    |---|---|
    | `GEMINI_API_KEY` | (from AI Studio) |
    | `FMP_API_KEY` | (from financialmodelingprep.com) |
    | `ALPHA_VANTAGE_KEY` | (from alphavantage.co) |
    | `NEWS_API_KEY` | (from newsapi.org) |
    | `GNEWS_API_KEY` | (from gnews.io) |
    | `SUPABASE_URL` | `https://tlkmapwwbcfuwtcdjfdn.supabase.co` |
    | `SUPABASE_SERVICE_KEY` | your `sb_secret_…` |
    | `FIREBASE_PROJECT_ID` | `klypup` |
    | `FIREBASE_CREDENTIALS_JSON` | paste the **full contents** of `backend/firebase-admin.json` as a one-line string |
    | `SEC_USER_AGENT` | `Klypup Research <your-real-email>` |
    | `CORS_ORIGINS` | `["https://klypup.web.app","https://klypup.firebaseapp.com"]` |

5. Click **Save, rebuild & deploy**.
6. Once status is **Live**, copy the URL shown at the top of the service page
   (e.g. `https://klypup-api.onrender.com`). Verify it:

    ```bash
    curl https://klypup-api.onrender.com/api/health
    # → {"status":"ok"}
    ```

## Step 3 — Build + deploy the frontend to Firebase Hosting

```bash
cd frontend

# Edit .env.production — replace VITE_API_BASE_URL with the Render URL from step 2.
# All other values are already filled in for the klypup project.

npm --cache /tmp/klypup-npm-cache install   # if you haven't already
npm run build

cd ..
firebase deploy --only hosting
```

Firebase prints the hosted URL: `https://klypup.web.app`.

## Step 4 — Tighten CORS

You listed `https://klypup.web.app` in `CORS_ORIGINS` in step 2. That means
only your Firebase Hosting domain can call the API. If the browser shows
CORS errors, double-check the value in Render → Environment matches the URL
Firebase printed (including `https://` and no trailing slash).

## Step 5 — Warm up the RAG (optional, for filings in demo)

Render's disk is ephemeral, so ChromaDB restarts empty on every cold boot.
To demo the SEC filings section, SSH into the Render shell once the service
is live:

**Dashboard → klypup-api → Shell**, then:

```bash
python scripts/ingest_filings.py --ticker NVDA --form 10-K
python scripts/ingest_filings.py --ticker AMD --form 10-K
python scripts/ingest_filings.py --ticker JPM --form 10-K
```

This takes ~2 minutes per filing. They persist until the service cold-boots
again. For long-lived RAG, upgrade to Render Starter ($7/mo) which includes
a 1 GB persistent disk, or migrate filings embeddings into Supabase pgvector.

---

## Verification checklist

After both deploys, open `https://klypup.web.app` in a fresh browser:

- [ ] Login page loads (no blank screen / no console errors)
- [ ] Google sign-in works
- [ ] Dashboard shows the sector heatmap + movers (may take 30s on first request — cold start)
- [ ] Add AAPL to the watchlist → it persists on refresh
- [ ] Run a research query → sections stream in → report saves
- [ ] Open the saved report → chat panel responds to "Which is the better buy?"
- [ ] DevTools Network tab: every `/api/*` call goes to `klypup-api.onrender.com`, no CORS errors

If any of those fail, check Render logs (**Dashboard → klypup-api → Logs**)
— they're timestamped and show the same INFO-level trace you get locally.

---

## Rollback

Render: **Dashboard → klypup-api → Deploys → previous build → Redeploy**.

Firebase Hosting: `firebase hosting:rollback` — restores the prior release
channel.

---

## When to outgrow free tier

| Symptom | Upgrade to |
|---|---|
| Cold starts are killing the demo UX | Render Starter ($7/mo) — no sleep |
| Need persistent RAG | Render Starter — 1 GB SSD |
| Need Playwright / web_scrape tool | Cloud Run (min-instances=1 ≈ $5/mo) — 2 GB RAM and a bigger image |
| More than ~850 page loads/day | Firebase Hosting Blaze plan (pay-as-you-go, still free under the 10 GB/360 MB daily limits) |
