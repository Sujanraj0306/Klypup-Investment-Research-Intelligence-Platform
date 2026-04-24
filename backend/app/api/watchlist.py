"""Watchlist CRUD backed by Firestore with live quote enrichment.

Collection path: /orgs/{orgId}/watchlist/{symbol}
Document fields: { symbol, addedAt, order }
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from ..core import market as market_core
from ..core.firestore_client import watchlist_collection
from .auth import CurrentOrgUser

_logger = logging.getLogger(__name__)
router = APIRouter()


class AddItem(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)


def _sentiment_for(symbol: str) -> str:
    # Placeholder — real sentiment ships in Phase 3. Deterministic per symbol
    # so the UI doesn't flicker between fetches.
    buckets = ("positive", "neutral", "negative")
    rng = random.Random(symbol.upper())
    return buckets[rng.randint(0, 2)]


async def _enrich_item(doc_data: Dict[str, Any]) -> Dict[str, Any]:
    symbol = doc_data["symbol"]
    quote, sparkline = await asyncio.gather(
        market_core.get_quote(symbol),
        market_core.get_sparkline_closes(symbol),
    )
    return {
        **quote,
        "addedAt": doc_data.get("addedAt"),
        "order": doc_data.get("order"),
        "history": sparkline,
        "sentiment": _sentiment_for(symbol),
    }


def _list_watchlist_docs_blocking(org_id: str) -> List[Dict[str, Any]]:
    col = watchlist_collection(org_id)
    items: List[Dict[str, Any]] = []
    # Single-field order_by — avoids needing a composite index. Ties broken
    # by addedAt client-side below.
    for snap in col.order_by("order").stream():
        data = snap.to_dict() or {}
        data["symbol"] = snap.id
        added = data.get("addedAt")
        if hasattr(added, "isoformat"):
            data["addedAt"] = added.isoformat()
        items.append(data)
    items.sort(key=lambda d: (d.get("order") or 0, d.get("addedAt") or ""))
    return items


@router.get("")
async def list_watchlist(user: CurrentOrgUser) -> List[Dict[str, Any]]:
    assert user.org_id
    docs = await asyncio.to_thread(_list_watchlist_docs_blocking, user.org_id)
    return await asyncio.gather(*[_enrich_item(d) for d in docs])


def _write_watchlist_doc_blocking(org_id: str, symbol: str) -> Dict[str, Any]:
    col = watchlist_collection(org_id)
    doc_ref = col.document(symbol)
    existing = doc_ref.get()
    if existing.exists:
        raise FileExistsError(symbol)
    # Append at the end — use current count as order.
    order = sum(1 for _ in col.list_documents())
    payload = {
        "symbol": symbol,
        "order": order,
        "addedAt": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(payload)
    return {"symbol": symbol, "order": order, "addedAt": None}


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    payload: AddItem, user: CurrentOrgUser
) -> Dict[str, Any]:
    assert user.org_id
    symbol = payload.symbol.strip().upper()
    if not await market_core.symbol_exists(symbol):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown symbol: {symbol}",
        )
    try:
        doc = await asyncio.to_thread(
            _write_watchlist_doc_blocking, user.org_id, symbol
        )
    except FileExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{symbol} is already on the watchlist",
        )
    return await _enrich_item(doc)


def _delete_watchlist_doc_blocking(org_id: str, symbol: str) -> bool:
    col = watchlist_collection(org_id)
    doc_ref = col.document(symbol)
    snap = doc_ref.get()
    if not snap.exists:
        return False
    doc_ref.delete()
    return True


@router.delete("/{symbol}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_from_watchlist(symbol: str, user: CurrentOrgUser):
    assert user.org_id
    deleted = await asyncio.to_thread(
        _delete_watchlist_doc_blocking, user.org_id, symbol.upper()
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{symbol.upper()} not on watchlist",
        )


class ReorderPayload(BaseModel):
    order: List[str] = Field(..., description="Symbols in desired display order")


def _reorder_blocking(org_id: str, order: List[str]) -> None:
    col = watchlist_collection(org_id)
    db = col._client
    batch = db.batch()
    for idx, symbol in enumerate(order):
        batch.update(col.document(symbol.upper()), {"order": idx})
    batch.commit()


@router.patch("/order", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def reorder_watchlist(payload: ReorderPayload, user: CurrentOrgUser):
    assert user.org_id
    if not payload.order:
        return
    try:
        await asyncio.to_thread(_reorder_blocking, user.org_id, payload.order)
    except Exception as exc:
        _logger.exception("Watchlist reorder failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reorder watchlist",
        ) from exc
