"""Market data endpoints — all require Firebase auth."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..core import market as market_core
from .auth import CurrentUser

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=80)


@router.get("/quote/{symbol}")
async def quote(symbol: str, user: CurrentUser) -> dict:
    _ = user
    if not symbol:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="symbol required")
    data = await market_core.get_quote(symbol)
    if data.get("price") is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No price data for symbol {symbol.upper()}",
        )
    return data


@router.get("/history/{symbol}")
async def history(
    symbol: str,
    user: CurrentUser,
    period: str = Query("1mo"),
    interval: str = Query("1d"),
) -> List[dict]:
    _ = user
    return await market_core.get_history(symbol, period=period, interval=interval)


@router.get("/sector-heatmap")
async def sector_heatmap(user: CurrentUser) -> List[dict]:
    _ = user
    return await market_core.get_sector_heatmap()


@router.get("/movers")
async def movers(user: CurrentUser) -> dict:
    _ = user
    return await market_core.get_market_movers()


@router.get("/multi-quote")
async def multi_quote(
    user: CurrentUser,
    symbols: str = Query(..., description="Comma-separated symbols (max 10)"),
) -> List[dict]:
    _ = user
    parsed = [s.strip() for s in symbols.split(",") if s.strip()]
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="symbols parameter required",
        )
    return await market_core.get_multi_quote(parsed)


@router.post("/search")
async def search(payload: SearchRequest, user: CurrentUser) -> List[dict]:
    _ = user
    return market_core.search_symbols(payload.query)
