"""Reports CRUD backed by Firestore + optional Supabase semantic search.

Collection path: /orgs/{orgId}/reports/{reportId}
Semantic search is opt-in: if Supabase/Gemini aren't configured, text-search
queries fall back to a simple title/query substring match.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from ..core import embeddings
from ..core.firestore_client import reports_collection
from .auth import CurrentOrgUser

_logger = logging.getLogger(__name__)
router = APIRouter()


class ReportCreate(BaseModel):
    title: Optional[str] = None
    query: str = Field(..., min_length=1)
    companies: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    status: str = "complete"
    sourceCount: int = 0
    durationMs: int = 0
    sections: Dict[str, Any] = Field(default_factory=dict)
    summary: Optional[str] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    tags: Optional[List[str]] = None


def _serialize(snap) -> Dict[str, Any]:
    data = snap.to_dict() or {}
    data["id"] = snap.id
    for key in ("createdAt", "updatedAt"):
        val = data.get(key)
        if hasattr(val, "isoformat"):
            data[key] = val.isoformat()
    return data


def _summary_from(payload: ReportCreate) -> str:
    if payload.summary:
        return payload.summary[:1000]
    # Stitch a naive summary from any synthesis/market section so the
    # embedding has something meaningful to index on.
    for key in ("synthesis", "market", "news"):
        section = payload.sections.get(key)
        if isinstance(section, dict):
            for candidate_key in ("summary", "overview", "text"):
                val = section.get(candidate_key)
                if isinstance(val, str) and val:
                    return val[:1000]
    return payload.query[:1000]


def _list_reports_blocking(
    org_id: str,
    limit: int,
    offset: int,
    tags: Optional[List[str]],
) -> List[Dict[str, Any]]:
    col = reports_collection(org_id)
    query = col.order_by("createdAt", direction=firestore.Query.DESCENDING)
    if tags:
        query = query.where("tags", "array_contains_any", tags[:10])
    if offset:
        query = query.offset(offset)
    query = query.limit(limit)
    return [_serialize(snap) for snap in query.stream()]


def _keyword_filter(reports: List[Dict[str, Any]], needle: str) -> List[Dict[str, Any]]:
    needle = needle.lower().strip()
    if not needle:
        return reports
    out = []
    for r in reports:
        hay = " ".join(
            [
                str(r.get("title") or ""),
                str(r.get("query") or ""),
                " ".join(r.get("companies") or []),
                " ".join(r.get("tags") or []),
            ]
        ).lower()
        if needle in hay:
            out.append(r)
    return out


@router.get("")
async def list_reports(
    user: CurrentOrgUser,
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    assert user.org_id
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    reports = await asyncio.to_thread(
        _list_reports_blocking, user.org_id, limit, offset, tag_list
    )

    semantic_hits: List[Dict[str, Any]] = []
    if search:
        # Keyword first (always); semantic results piggyback when available.
        reports = _keyword_filter(reports, search)
        try:
            semantic_hits = await embeddings.semantic_search(
                search, user.org_id, limit=5
            )
        except Exception:
            _logger.exception("Semantic search failed; falling back to keyword")

    return {
        "items": reports,
        "semantic": semantic_hits,
        "limit": limit,
        "offset": offset,
    }


def _get_report_blocking(org_id: str, report_id: str) -> Optional[Dict[str, Any]]:
    snap = reports_collection(org_id).document(report_id).get()
    if not snap.exists:
        return None
    return _serialize(snap)


@router.get("/{report_id}")
async def get_report(report_id: str, user: CurrentOrgUser) -> Dict[str, Any]:
    assert user.org_id
    report = await asyncio.to_thread(_get_report_blocking, user.org_id, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    return report


def _create_report_blocking(
    org_id: str, author_uid: str, payload: ReportCreate
) -> Dict[str, Any]:
    col = reports_collection(org_id)
    doc_ref = col.document()
    data = {
        "title": payload.title or payload.query[:80],
        "query": payload.query,
        "companies": payload.companies,
        "tags": payload.tags,
        "status": payload.status,
        "sourceCount": payload.sourceCount,
        "durationMs": payload.durationMs,
        "sections": payload.sections,
        "summary": _summary_from(payload),
        "authorUid": author_uid,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(data)
    return {"id": doc_ref.id, **data, "createdAt": datetime.now(timezone.utc).isoformat()}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate, user: CurrentOrgUser
) -> Dict[str, Any]:
    assert user.org_id
    created = await asyncio.to_thread(
        _create_report_blocking, user.org_id, user.uid, payload
    )
    # Fire-and-forget embedding upsert so the POST returns fast.
    asyncio.create_task(
        embeddings.upsert_report_embedding(
            org_id=user.org_id,
            report_id=created["id"],
            query=payload.query,
            companies=payload.companies,
            summary=_summary_from(payload),
            tags=payload.tags,
        )
    )
    return created


def _patch_report_blocking(
    org_id: str, report_id: str, updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    ref = reports_collection(org_id).document(report_id)
    if not ref.get().exists:
        return None
    updates = {**updates, "updatedAt": firestore.SERVER_TIMESTAMP}
    ref.update(updates)
    return _serialize(ref.get())


@router.patch("/{report_id}")
async def update_report(
    report_id: str, payload: ReportUpdate, user: CurrentOrgUser
) -> Dict[str, Any]:
    assert user.org_id
    updates: Dict[str, Any] = {}
    if payload.title is not None:
        updates["title"] = payload.title
    if payload.tags is not None:
        updates["tags"] = payload.tags
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field required",
        )
    report = await asyncio.to_thread(
        _patch_report_blocking, user.org_id, report_id, updates
    )
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    if "tags" in updates:
        asyncio.create_task(
            embeddings.upsert_report_embedding(
                org_id=user.org_id,
                report_id=report_id,
                query=report.get("query", ""),
                companies=report.get("companies", []),
                summary=report.get("summary", ""),
                tags=report.get("tags", []),
            )
        )
    return report


def _delete_report_blocking(org_id: str, report_id: str) -> bool:
    ref = reports_collection(org_id).document(report_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_report(report_id: str, user: CurrentOrgUser):
    assert user.org_id
    deleted = await asyncio.to_thread(
        _delete_report_blocking, user.org_id, report_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    asyncio.create_task(embeddings.delete_report_embedding(report_id))
