"""Comparison endpoint — runs tools in parallel across N companies, then
synthesizes a comparative analysis.

SSE event contract matches /api/research/stream:
  agent_step  -> { step, progress }
  section     -> { section: "market"|"news"|"social"|"synthesis", data }
  complete    -> { symbols, duration_ms, progress }
  error       -> { message }
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..agent import tools as tool_module
from ..agent.research_agent import _KNOWN_TICKERS as KNOWN_TICKERS
from ..core.config import settings
from .auth import CurrentOrgUser

_logger = logging.getLogger(__name__)
router = APIRouter()


class CompareRequest(BaseModel):
    symbols: List[str] = Field(..., min_length=2, max_length=4)


async def _emit(event: str, data: Dict[str, Any]) -> Dict[str, str]:
    return {"event": event, "data": json.dumps(data, default=str)}


def _safe_num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _metric_winners(
    market: Dict[str, Any],
    news: Dict[str, Any],
    symbols: List[str],
) -> Dict[str, Optional[str]]:
    """Pick the best symbol per metric. Lower-is-better metrics are inverted."""

    def best_of(key: str, higher_is_better: bool = True) -> Optional[str]:
        vals = [(s, _safe_num((market.get(s) or {}).get(key))) for s in symbols]
        vals = [(s, v) for s, v in vals if v is not None]
        if not vals:
            return None
        picked = (
            max(vals, key=lambda x: x[1]) if higher_is_better
            else min(vals, key=lambda x: x[1])
        )
        return picked[0]

    winners: Dict[str, Optional[str]] = {
        "revenue_growth": best_of("revenue_growth", True),
        "gross_margins": best_of("gross_margins", True),
        "profit_margins": best_of("profit_margins", True),
        "valuation": best_of("pe_ratio", higher_is_better=False),
        "forward_valuation": best_of("forward_pe", higher_is_better=False),
        "revenue": best_of("revenue", True),
        "market_cap": best_of("market_cap", True),
        "momentum": best_of("change_pct", True),
    }

    # News sentiment winner — use 0-100 normalized score (NewsAPI/company name key)
    sent_scores: List[tuple[str, float]] = []
    for s in symbols:
        name = KNOWN_TICKERS.get(s, s)
        entry = news.get(name) or news.get(s)
        if entry and entry.get("sentiment_score_0_100") is not None:
            sent_scores.append((s, float(entry["sentiment_score_0_100"])))
    winners["sentiment"] = (
        max(sent_scores, key=lambda x: x[1])[0] if sent_scores else None
    )
    return winners


def _investor_profiles(
    winners: Dict[str, Optional[str]],
    market: Dict[str, Any],
    symbols: List[str],
) -> Dict[str, Optional[str]]:
    """Match metric winners to investor archetypes."""
    dividend_best = None
    best_yield: Optional[float] = None
    for s in symbols:
        y = _safe_num((market.get(s) or {}).get("dividend_yield"))
        if y is not None and (best_yield is None or y > best_yield):
            best_yield, dividend_best = y, s

    return {
        "growth": winners.get("revenue_growth") or winners.get("momentum"),
        "value": winners.get("valuation") or winners.get("forward_valuation"),
        "momentum": winners.get("momentum"),
        "income": dividend_best,
        "sentiment": winners.get("sentiment"),
    }


def _heuristic_narrative(
    symbols: List[str],
    market: Dict[str, Any],
    news: Dict[str, Any],
    winners: Dict[str, Optional[str]],
) -> str:
    lines: List[str] = []
    lines.append(
        f"Comparing {', '.join(symbols)} across market, news, and social signals."
    )
    for sym in symbols:
        q = market.get(sym) or {}
        name = q.get("name") or sym
        price = q.get("price")
        change = q.get("change_pct")
        rev_growth = q.get("revenue_growth")
        parts = [f"{sym} ({name})"]
        if price is not None:
            parts.append(f"trades at ${float(price):.2f}")
        if change is not None:
            parts.append(f"({float(change):+.2f}% today)")
        if rev_growth is not None:
            parts.append(f"with revenue growth of {float(rev_growth) * 100:.1f}%")
        lines.append(" ".join(parts) + ". [Source: Yahoo Finance]")
    if winners.get("revenue_growth"):
        lines.append(
            f"{winners['revenue_growth']} leads on revenue growth;"
            f" {winners.get('valuation') or '—'} on valuation;"
            f" {winners.get('sentiment') or '—'} on news sentiment."
            " [Source: Yahoo Finance, NewsAPI]"
        )
    return " ".join(lines)


async def _gemini_synthesis(
    symbols: List[str],
    market: Dict[str, Any],
    news: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Ask Gemini for a structured comparison. Returns None on failure."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
    except Exception:
        return None

    compact_news = {
        s: {
            "label": (news.get(KNOWN_TICKERS.get(s, s)) or news.get(s) or {}).get(
                "sentiment_label"
            ),
            "score_0_100": (
                news.get(KNOWN_TICKERS.get(s, s)) or news.get(s) or {}
            ).get("sentiment_score_0_100"),
            "article_count": (
                news.get(KNOWN_TICKERS.get(s, s)) or news.get(s) or {}
            ).get("article_count"),
        }
        for s in symbols
    }

    prompt = f"""
You are comparing these {len(symbols)} companies: {", ".join(symbols)}

Market data (trimmed):
{json.dumps({s: {k: v for k, v in (market.get(s) or {}).items() if k != "history"} for s in symbols})}

News sentiment:
{json.dumps(compact_news)}

Return ONLY JSON (no prose before/after) with this exact schema:

{{
  "metric_winners": {{
    "revenue_growth": "TICKER",
    "valuation": "TICKER",
    "momentum": "TICKER",
    "sentiment": "TICKER"
  }},
  "comparison_narrative": "3-4 paragraph plain prose comparison with inline [Source: …] citations. No markdown headings.",
  "investor_profiles": {{
    "growth": "TICKER",
    "value": "TICKER",
    "momentum": "TICKER",
    "income": "TICKER"
  }},
  "key_differentiators": ["short bullet", "another", "..."]
}}
""".strip()

    try:
        model = genai.GenerativeModel(settings.GEMINI_MODEL)
        response = await asyncio.to_thread(
            model.generate_content, prompt
        )
        text = getattr(response, "text", "") or ""
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group(0))
    except Exception:
        _logger.exception("Gemini synthesis failed")
        return None


async def _stream(symbols: List[str]) -> AsyncIterator[Dict[str, str]]:
    started = time.time()

    yield await _emit(
        "agent_step",
        {
            "step": f"Starting parallel analysis of {', '.join(symbols)}…",
            "progress": 5,
        },
    )

    companies = [KNOWN_TICKERS.get(s, s) for s in symbols]

    try:
        market_task = tool_module.get_market_data(symbols)
        news_task = tool_module.get_news_and_sentiment(companies)
        social_task = tool_module.get_social_trends(companies, symbols)

        yield await _emit(
            "agent_step",
            {"step": "Fetching market data, news, and social…", "progress": 20},
        )
        market_data, news_data, social_data = await asyncio.gather(
            market_task, news_task, social_task, return_exceptions=True
        )
    except Exception as exc:
        _logger.exception("Compare tool dispatch failed")
        yield await _emit("error", {"message": f"Tool dispatch failed: {exc}"})
        return

    # Tolerate per-tool failures
    if isinstance(market_data, Exception):
        market_data = {}
    if isinstance(news_data, Exception):
        news_data = {}
    if isinstance(social_data, Exception):
        social_data = {}

    yield await _emit(
        "agent_step",
        {"step": "Computing per-metric winners…", "progress": 55},
    )

    winners = _metric_winners(market_data, news_data, symbols)

    yield await _emit(
        "section",
        {
            "section": "market",
            "data": {
                "data": market_data,
                "sources": ["Yahoo Finance", "Financial Modeling Prep"],
            },
        },
    )
    yield await _emit(
        "section",
        {
            "section": "news",
            "data": {
                "sentiment_by_ticker": {
                    s: news_data.get(KNOWN_TICKERS.get(s, s)) or news_data.get(s) or {}
                    for s in symbols
                },
                "sources": ["NewsAPI", "GNews"],
            },
        },
    )
    yield await _emit(
        "section",
        {
            "section": "social",
            "data": {
                "data": social_data,
                "sources": ["Google Trends", "Reddit"],
            },
        },
    )

    yield await _emit(
        "agent_step",
        {"step": "Generating comparison synthesis…", "progress": 75},
    )

    synthesis = await _gemini_synthesis(symbols, market_data, news_data)
    if synthesis is None:
        synthesis = {
            "metric_winners": winners,
            "comparison_narrative": _heuristic_narrative(
                symbols, market_data, news_data, winners
            ),
            "investor_profiles": _investor_profiles(winners, market_data, symbols),
            "key_differentiators": [
                f"{sym}: {(market_data.get(sym) or {}).get('industry') or 'n/a'}"
                for sym in symbols
            ],
        }

    yield await _emit(
        "section", {"section": "synthesis", "data": synthesis}
    )

    yield await _emit(
        "complete",
        {
            "symbols": symbols,
            "duration_ms": int((time.time() - started) * 1000),
            "progress": 100,
        },
    )


@router.post("/stream")
async def stream_compare(
    request: CompareRequest,
    user: CurrentOrgUser,
):
    _ = user
    symbols = [s.strip().upper() for s in request.symbols if s and s.strip()][:4]
    return EventSourceResponse(_stream(symbols), media_type="text/event-stream")
