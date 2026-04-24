"""Research SSE endpoint + quick quote.

POST /api/research/stream
    Body: { "query": "...", "companies"?: ["NVDA"], "time_period"?: "Q3 2024" }
    Streams Server-Sent Events where each event's `data` field is a JSON
    string. The last event is `complete` and contains the saved report id.

POST /api/research/quick-quote
    Body: { "symbol": "AAPL" }
    Returns a single quote (no LLM, no RAG).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from firebase_admin import firestore
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..agent.research_agent import run_research
from ..core import embeddings as embeddings_core, market as market_core
from ..core.firestore_client import reports_collection
from .auth import CurrentOrgUser

_logger = logging.getLogger(__name__)
router = APIRouter()


class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=8, max_length=500)
    companies: Optional[List[str]] = None
    time_period: Optional[str] = None


def _save_report_blocking(
    org_id: str,
    author_uid: str,
    query: str,
    report: Dict[str, Any],
    duration_ms: int,
    tools_used: List[str],
) -> str:
    col = reports_collection(org_id)
    doc_ref = col.document()
    companies = report.get("companies") or []
    sections = report.get("sections") or {}
    title = (
        report.get("title")
        or (sections.get("synthesis") or {}).get("title")
        or f"Research: {query[:60]}"
    )
    summary = (sections.get("synthesis") or {}).get("summary") or query
    payload = {
        "title": title,
        "query": query,
        "companies": companies,
        "tags": [],
        "sections": sections,
        "summary": summary[:2000] if isinstance(summary, str) else "",
        "status": "complete",
        "sourceCount": _count_sources(sections),
        "durationMs": duration_ms,
        "toolsUsed": tools_used,
        "authorUid": author_uid,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(payload)
    return doc_ref.id


def _count_sources(sections: Dict[str, Any]) -> int:
    count = 0
    for key in ("market", "news", "filings", "social"):
        entry = sections.get(key)
        if not entry:
            continue
        count += len(entry.get("sources", []) or [])
        count += len(entry.get("articles", []) or [])
        count += len(entry.get("passages", []) or [])
    return count


async def _emit(event: str, data: Dict[str, Any]) -> Dict[str, str]:
    return {"event": event, "data": json.dumps(data, default=str)}


async def _stream(
    request: ResearchRequest,
    org_id: str,
    author_uid: str,
) -> AsyncIterator[Dict[str, str]]:
    started = time.time()
    final_report: Dict[str, Any] = {"sections": {}}
    companies: List[str] = []
    tools_used: List[str] = []

    try:
        async for event in run_research(
            query=request.query,
            companies=request.companies,
            time_period=request.time_period,
        ):
            etype = event.get("type")
            if etype == "agent_step":
                yield await _emit(
                    "agent_step",
                    {k: v for k, v in event.items() if k != "type"},
                )
            elif etype == "section":
                yield await _emit(
                    "section",
                    {"section": event["section"], "data": event["data"]},
                )
                # Small pause so the browser renders sections one at a time.
                await asyncio.sleep(0.05)
            elif etype == "final":
                companies = event.get("companies") or []
                tools_used = event.get("tools_used") or []
                final_report = event.get("raw_json") or final_report
            elif etype == "error":
                yield await _emit("error", {"message": event.get("message", "unknown error")})
                return
    except Exception as exc:
        _logger.exception("Research stream failed")
        yield await _emit("error", {"message": str(exc)})
        return

    duration_ms = int((time.time() - started) * 1000)

    try:
        _logger.info("  · saving report to Firestore…")
        report_id = await asyncio.to_thread(
            _save_report_blocking,
            org_id,
            author_uid,
            request.query,
            final_report,
            duration_ms,
            tools_used,
        )
        _logger.info("  ✓ report saved id=%s duration=%dms", report_id, duration_ms)
    except Exception as exc:
        _logger.exception("Failed to save research report")
        yield await _emit("error", {"message": f"Could not save report: {exc}"})
        return

    # Fire-and-forget embedding for semantic search
    summary_text = ((final_report.get("sections") or {}).get("synthesis") or {}).get(
        "summary"
    ) or request.query
    asyncio.create_task(
        embeddings_core.upsert_report_embedding(
            org_id=org_id,
            report_id=report_id,
            query=request.query,
            companies=companies,
            summary=summary_text if isinstance(summary_text, str) else "",
            tags=[],
        )
    )

    yield await _emit(
        "complete",
        {
            "report_id": report_id,
            "duration_ms": duration_ms,
            "tools_used": tools_used,
            "companies": companies,
            "progress": 100,
        },
    )


@router.post("/stream")
async def stream_research(
    request: ResearchRequest,
    user: CurrentOrgUser,
):
    assert user.org_id
    return EventSourceResponse(
        _stream(request, user.org_id, user.uid),
        media_type="text/event-stream",
    )


class QuickQuoteRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)


@router.post("/quick-quote")
async def quick_quote(
    payload: QuickQuoteRequest,
    user: CurrentOrgUser,
) -> Dict[str, Any]:
    _ = user
    quote = await market_core.get_quote(payload.symbol)
    if quote.get("price") is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No data for {payload.symbol.upper()}",
        )
    return quote


@router.get("/rag-stats")
async def rag_stats(
    user: CurrentOrgUser,
    include_sample: bool = Query(False),
) -> Dict[str, Any]:
    from ..services.rag_service import rag_service

    _ = user
    stats = rag_service.stats()
    if include_sample and stats.get("total_chunks", 0) > 0:
        sample = await rag_service.query("revenue", n_results=1)
        stats["sample"] = sample
    return stats
