-- Klypup — Supabase initialization
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Creates the pgvector extension, the report_embeddings table, the match_reports RPC,
-- and multi-tenant RLS policies.

-- 1. Enable pgvector so we can store 3072-dim Gemini embeddings.
create extension if not exists vector;

-- 2. Embeddings table — one row per saved research report, keyed by (org_id, report_id).
--    org_id mirrors the Firestore org so the two stores stay in sync.
--    report_id is the Firestore document id from /orgs/{orgId}/reports/{reportId}.
create table if not exists public.report_embeddings (
  id           bigserial primary key,
  org_id       text        not null,
  report_id    text        not null unique,
  query        text,
  companies    text[]      default '{}',
  summary      text,
  tags         text[]      default '{}',
  embedding    vector(3072) not null,
  created_at   timestamptz not null default now()
);

-- 3. Indexes
create index if not exists report_embeddings_org_id_idx
  on public.report_embeddings (org_id);

-- Note: pgvector's ivfflat/hnsw indexes only support up to 2000 dimensions.
-- Gemini embeddings are 3072-dim, so similarity search runs as a sequential
-- scan per org. That is fine up to tens of thousands of reports per org.

-- 4. Semantic search RPC — called from backend/app/core/embeddings.py:semantic_search.
--    Returns reports in the given org ranked by cosine distance to the query embedding.
create or replace function public.match_reports(
  query_embedding vector(3072),
  org_id          text,
  match_count     int default 5
)
returns table (
  report_id  text,
  query      text,
  companies  text[],
  summary    text,
  tags       text[],
  similarity float
)
language sql stable
as $$
  select
    r.report_id,
    r.query,
    r.companies,
    r.summary,
    r.tags,
    1 - (r.embedding <=> query_embedding) as similarity
  from public.report_embeddings r
  where r.org_id = match_reports.org_id
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Row Level Security — defense in depth on top of backend org scoping.
alter table public.report_embeddings enable row level security;

-- Service role (backend) can read/write everything — used by the FastAPI layer
-- with the SUPABASE_SERVICE_KEY.
drop policy if exists "service role all" on public.report_embeddings;
create policy "service role all"
  on public.report_embeddings
  for all
  to service_role
  using (true)
  with check (true);

-- Authenticated users (frontend anon/auth key) are blocked by default — all
-- semantic search goes through the backend, never direct from the browser.
-- Uncomment if you later expose direct reads:
--   create policy "own org reads"
--     on public.report_embeddings
--     for select
--     to authenticated
--     using (org_id = auth.jwt() ->> 'org_id');
