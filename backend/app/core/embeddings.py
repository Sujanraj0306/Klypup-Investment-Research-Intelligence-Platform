"""Gemini embeddings + Supabase semantic search.

Degrades gracefully:
  - If GEMINI_API_KEY is missing, embed_text returns None.
  - If Supabase isn't configured, upserts/deletes/search no-op.

This way Phase 2 CRUD still works without optional services wired up,
and Phase 3 can rely on the same interface.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

import google.generativeai as genai

from .config import settings
from .supabase_client import get_supabase

_logger = logging.getLogger(__name__)
_configured = False


def _ensure_configured() -> bool:
    global _configured
    if _configured:
        return True
    if not settings.GEMINI_API_KEY:
        return False
    genai.configure(api_key=settings.GEMINI_API_KEY)
    _configured = True
    return True


async def embed_text(
    text: str,
    task_type: str = "retrieval_document",
) -> Optional[List[float]]:
    if not _ensure_configured() or not text:
        return None
    try:
        result = await asyncio.to_thread(
            genai.embed_content,
            model="models/gemini-embedding-001",
            content=text,
            task_type=task_type,
        )
        return result.get("embedding")
    except Exception:
        _logger.exception("Gemini embed_content failed")
        return None


async def upsert_report_embedding(
    *,
    org_id: str,
    report_id: str,
    query: str,
    companies: List[str],
    summary: str,
    tags: List[str],
) -> bool:
    supabase = get_supabase()
    if supabase is None:
        return False
    text = " ".join(filter(None, [query, summary, " ".join(companies)]))
    embedding = await embed_text(text, task_type="retrieval_document")
    if embedding is None:
        return False
    try:
        await asyncio.to_thread(
            lambda: supabase.table("report_embeddings")
            .upsert(
                {
                    "org_id": org_id,
                    "report_id": report_id,
                    "query": query,
                    "companies": companies,
                    "summary": summary,
                    "tags": tags,
                    "embedding": embedding,
                },
                on_conflict="report_id",
            )
            .execute()
        )
        return True
    except Exception:
        _logger.exception("Supabase upsert_report_embedding failed")
        return False


async def delete_report_embedding(report_id: str) -> None:
    supabase = get_supabase()
    if supabase is None:
        return
    try:
        await asyncio.to_thread(
            lambda: supabase.table("report_embeddings")
            .delete()
            .eq("report_id", report_id)
            .execute()
        )
    except Exception:
        _logger.exception("Supabase delete_report_embedding failed")


async def semantic_search(
    query: str,
    org_id: str,
    limit: int = 5,
) -> List[dict]:
    supabase = get_supabase()
    if supabase is None or not query:
        return []
    query_embedding = await embed_text(query, task_type="retrieval_query")
    if query_embedding is None:
        return []
    try:
        result = await asyncio.to_thread(
            lambda: supabase.rpc(
                "match_reports",
                {
                    "query_embedding": query_embedding,
                    "org_id": org_id,
                    "match_count": limit,
                },
            ).execute()
        )
        return result.data or []
    except Exception:
        _logger.exception("Supabase semantic_search rpc failed")
        return []
