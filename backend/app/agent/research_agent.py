"""Research agent orchestrator.

Two modes:

1. **Direct Gemini path** (default, when `GEMINI_API_KEY` is set). Uses
   `google.generativeai` function calling: Gemini decides which tools to call,
   we execute them locally, then ask Gemini to synthesize a structured JSON
   report. Streams progress as each tool finishes.

2. **Fallback path** (no API key). Heuristically picks tools from the query,
   runs them, and stitches a structured report together. Lets the pipeline
   demo without any LLM cost.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from ..core.config import settings
from . import tools as tool_module

_logger = logging.getLogger(__name__)


AGENT_INSTRUCTION = """
You are Klypup, an elite financial research intelligence agent. You help analysts
conduct comprehensive investment research by orchestrating multiple data sources.

TOOL SELECTION RULES — follow these precisely:
1. ALWAYS call get_market_data if the query mentions: any stock ticker, company
   name, price, valuation, financial metrics, earnings, revenue, P/E, market cap,
   stock performance, quarterly results, annual results, margins, growth rates.
2. ALWAYS call get_news_and_sentiment if the query mentions: news, recent events,
   announcements, sentiment, market reaction, what happened, latest developments,
   analyst ratings, upgrades/downgrades.
3. ALWAYS call query_sec_filings if the query mentions: 10-K, 10-Q, annual report,
   quarterly filing, balance sheet (detailed), risk factors, MD&A, management
   discussion, earnings transcript, guidance, outlook from filings.
4. Call get_social_trends if the query mentions: trending, social sentiment,
   Reddit, retail investors, community opinion, buzz, Google search interest.
5. Call web_scrape ONLY as a last resort when other tools return insufficient
   data for a specific URL.

OUTPUT STRUCTURE — ALWAYS return only a JSON object with this exact schema.
Wrap the JSON in a single ```json code fence.

{
  "companies": ["NVDA", "AMD"],
  "query_intent": "Compare earnings performance and competitive position",
  "sections": {
    "market": {
      "data": { ...raw market data... },
      "narrative": "NVIDIA reported Q3 revenue of ...",
      "key_insights": ["Revenue beat estimates by 12%", ...],
      "sources": ["Yahoo Finance", "Financial Modeling Prep"]
    },
    "news": {
      "articles": [...],
      "sentiment_by_company": {"NVDA": {...}, "AMD": {...}},
      "narrative": "News sentiment is strongly positive ...",
      "sources": ["NewsAPI", "GNews"]
    },
    "filings": {
      "passages": [...],
      "narrative": "According to NVIDIA's most recent 10-K ...",
      "sources": ["SEC EDGAR", "ChromaDB RAG"]
    },
    "social": {
      "data": {...},
      "narrative": "Google Trends shows ...",
      "sources": ["Google Trends", "Reddit"]
    },
    "synthesis": {
      "summary": "Full multi-paragraph analysis...",
      "comparison_table": [{"metric": "Revenue Growth", "NVDA": "206%", "AMD": "4%"}],
      "key_findings": ["NVIDIA dominates AI GPU market with 80% share..."]
    },
    "risks": [
      {"risk": "Customer concentration", "severity": "high", "detail": "..."},
      {"risk": "Export restrictions", "severity": "medium", "detail": "..."}
    ]
  }
}

SOURCE ATTRIBUTION: every claim must include a bracketed source, e.g.
[Source: Yahoo Finance], [Source: Reuters via NewsAPI], [Source: NVDA 10-K 2023].
RISK ASSESSMENT: always include 3-5 risks derived from the data you gathered,
each with severity high/medium/low.
""".strip()


# --------------------------------------------------------------------------
# Tool naming helpers + progress copy for the SSE stream.
# --------------------------------------------------------------------------

TOOL_PROGRESS = {
    "get_market_data": "Fetching live market data and financials…",
    "get_news_and_sentiment": "Scanning news sources and analyzing sentiment…",
    "query_sec_filings": "Searching SEC filings and earnings transcripts…",
    "get_social_trends": "Checking Reddit and Google Trends…",
    "web_search": "Running Google search for live context…",
    "web_scrape": "Scraping additional web sources…",
}


# --------------------------------------------------------------------------
# Heuristic extractors used by both the fallback path and by the ADK path
# when it needs to hint the agent.
# --------------------------------------------------------------------------

_KNOWN_TICKERS = {
    "AAPL": "Apple", "MSFT": "Microsoft", "GOOGL": "Alphabet", "GOOG": "Alphabet",
    "AMZN": "Amazon", "NVDA": "NVIDIA", "META": "Meta Platforms",
    "TSLA": "Tesla", "AMD": "Advanced Micro Devices", "INTC": "Intel",
    "JPM": "JPMorgan Chase", "GS": "Goldman Sachs", "BAC": "Bank of America",
    "NFLX": "Netflix", "DIS": "Disney", "BA": "Boeing", "CRM": "Salesforce",
    "ORCL": "Oracle", "ADBE": "Adobe", "BRK-B": "Berkshire Hathaway",
    "V": "Visa", "MA": "Mastercard", "UNH": "UnitedHealth",
    "XOM": "Exxon Mobil", "CVX": "Chevron", "KO": "Coca-Cola", "PEP": "PepsiCo",
    "WMT": "Walmart", "HD": "Home Depot", "MCD": "McDonald's",
    "AVGO": "Broadcom", "LLY": "Eli Lilly",
}

_NAME_TO_TICKER = {v.lower(): k for k, v in _KNOWN_TICKERS.items()}


def _extract_tickers(query: str, override: Optional[List[str]] = None) -> List[str]:
    if override:
        out = [t.strip().upper() for t in override if t and t.strip()]
        return sorted(set(out))
    candidates: List[str] = []
    # Explicit cashtag ($NVDA) or plain uppercase
    for m in re.finditer(r"\$?([A-Z]{2,5})\b", query):
        sym = m.group(1)
        if sym in _KNOWN_TICKERS:
            candidates.append(sym)
    # Company name match
    q_lower = query.lower()
    for name, ticker in _NAME_TO_TICKER.items():
        if name in q_lower:
            candidates.append(ticker)
    seen: List[str] = []
    for t in candidates:
        if t not in seen:
            seen.append(t)
    return seen


def _classify_tools(query: str) -> List[str]:
    """Return which tools the fallback path should run for this query."""
    q = query.lower()
    tools: List[str] = ["get_market_data"]
    if any(
        k in q
        for k in (
            "news", "sentiment", "announce", "react", "recent",
            "latest", "rating", "upgrade", "downgrade", "headline",
        )
    ):
        tools.append("get_news_and_sentiment")
    if any(
        k in q
        for k in (
            "10-k", "10-q", "filing", "annual report", "quarterly",
            "balance sheet", "risk factor", "md&a", "guidance", "transcript",
        )
    ):
        tools.append("query_sec_filings")
    if any(
        k in q
        for k in (
            "reddit", "social", "trend", "retail", "buzz", "community",
            "sentiment analysis",
        )
    ):
        tools.append("get_social_trends")
    return tools


# --------------------------------------------------------------------------
# Public orchestrator interface — yields dicts representing SSE events.
# --------------------------------------------------------------------------

async def run_research(
    query: str,
    companies: Optional[List[str]] = None,
    time_period: Optional[str] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """Yield a stream of events describing the research run.

    Event shapes:
      {"type": "agent_step", "step": "...", "tool": "...", "progress": 0-100}
      {"type": "section", "section": "market"|"news"|..., "data": {...}}
      {"type": "final", "companies": [...], "tools_used": [...], "raw_json": {...}}
      {"type": "error", "message": "..."}
    """
    start = time.time()
    tickers = _extract_tickers(query, companies)
    _logger.info(
        "▶ Research start | query=%r tickers=%s have_gemini=%s",
        query[:80],
        tickers,
        bool(settings.GEMINI_API_KEY),
    )
    yield {
        "type": "agent_step",
        "step": "Analyzing your research query…",
        "progress": 5,
    }

    if settings.GEMINI_API_KEY:
        try:
            async for ev in _run_gemini_direct(query, tickers, time_period):
                yield ev
            return
        except Exception as exc:
            _logger.exception("Gemini path failed, falling back to manual")
            yield {
                "type": "agent_step",
                "step": f"Agent error — continuing with direct tool dispatch ({type(exc).__name__})",
                "progress": 20,
            }

    async for ev in _run_fallback(query, tickers, time_period):
        yield ev

    yield {
        "type": "agent_step",
        "step": "Done",
        "progress": 100,
        "duration_ms": int((time.time() - start) * 1000),
    }


# --------------------------------------------------------------------------
# Direct Gemini function-calling path (replaces ADK)
# --------------------------------------------------------------------------


def _tool_declarations():
    """Gemini function declarations matching tool_module.TOOLS."""
    import google.generativeai as genai
    from google.generativeai.types import FunctionDeclaration, Tool

    return Tool(
        function_declarations=[
            FunctionDeclaration(
                name="get_market_data",
                description=(
                    "Fetch live stock price, financials, and 30-day price "
                    "history for a list of tickers. Use for any question "
                    "about price, valuation, P/E, market cap, revenue, or "
                    "earnings performance."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "symbols": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Stock ticker symbols (e.g. AAPL, NVDA)",
                        },
                        "include_history": {
                            "type": "boolean",
                            "description": "Include 30-day price history",
                        },
                    },
                    "required": ["symbols"],
                },
            ),
            FunctionDeclaration(
                name="get_news_and_sentiment",
                description=(
                    "Fetch recent news articles and compute sentiment for "
                    "companies. Use for news, recent events, announcements, "
                    "analyst ratings, or market reaction."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "companies": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Company names or tickers",
                        },
                    },
                    "required": ["companies"],
                },
            ),
            FunctionDeclaration(
                name="query_sec_filings",
                description=(
                    "Search SEC filings (10-K, 10-Q, 8-K) and earnings "
                    "transcripts via semantic search. Use for balance sheet "
                    "details, risk factors, MD&A, or management guidance."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "tickers": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "query": {
                            "type": "string",
                            "description": "What to search for in filings",
                        },
                    },
                    "required": ["tickers", "query"],
                },
            ),
            FunctionDeclaration(
                name="get_social_trends",
                description=(
                    "Fetch social sentiment: Google Trends interest plus "
                    "Reddit mentions from investing subreddits. Use for "
                    "questions about retail investors, buzz, or community."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "companies": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "tickers": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["companies", "tickers"],
                },
            ),
            FunctionDeclaration(
                name="web_search",
                description=(
                    "Live Google search via Gemini grounding. Use this when "
                    "no ticker is detected, for macro/regulatory/industry "
                    "questions, or when the other tools return empty. Returns "
                    "a grounded answer plus cited source URLs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search question",
                        },
                        "focus_companies": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tickers or company names to focus on",
                        },
                    },
                    "required": ["query"],
                },
            ),
        ]
    )


_TOOL_MAP = {
    "get_market_data": tool_module.get_market_data,
    "get_news_and_sentiment": tool_module.get_news_and_sentiment,
    "query_sec_filings": tool_module.query_sec_filings,
    "get_social_trends": tool_module.get_social_trends,
    "web_search": tool_module.web_search,
}


async def _run_gemini_direct(
    query: str,
    tickers: List[str],
    time_period: Optional[str],
) -> AsyncIterator[Dict[str, Any]]:
    """Direct Gemini function calling — no ADK runner.

    Flow: ask Gemini which tools to run, execute locally, then ask Gemini to
    synthesize a structured JSON report.
    """
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)

    yield {
        "type": "agent_step",
        "step": "Gemini is analyzing your query…",
        "progress": 12,
    }

    tools = _tool_declarations()
    dispatcher = genai.GenerativeModel(settings.GEMINI_MODEL, tools=[tools])

    # --- Turn 1: let Gemini propose tool calls ---
    dispatch_prompt = (
        f"Research query: {query}\n"
        + (f"Focus companies: {', '.join(tickers)}\n" if tickers else "")
        + (f"Time period: {time_period}\n" if time_period else "")
        + "Call the appropriate tools to gather data for this research query. "
          "Prefer get_market_data and get_news_and_sentiment for most queries."
    )

    try:
        _logger.info("  · Gemini dispatch call (model=%s)…", settings.GEMINI_MODEL)
        dispatch_response = await asyncio.to_thread(
            dispatcher.generate_content, dispatch_prompt
        )
        _logger.info("  ✓ Gemini dispatch returned")
    except Exception:
        _logger.exception("  ✗ Gemini dispatch call failed")
        dispatch_response = None

    tool_calls: List[Tuple[str, Dict[str, Any]]] = []
    if dispatch_response is not None:
        try:
            for cand in getattr(dispatch_response, "candidates", []) or []:
                content = getattr(cand, "content", None)
                if content is None:
                    continue
                for part in getattr(content, "parts", []) or []:
                    fc = getattr(part, "function_call", None)
                    if fc and getattr(fc, "name", None):
                        args: Dict[str, Any] = {}
                        try:
                            args = dict(fc.args) if fc.args else {}
                        except Exception:
                            args = {}
                        tool_calls.append((fc.name, args))
        except Exception:
            _logger.exception("Could not parse Gemini tool calls")

    # Fallback: if Gemini didn't request any tools, dispatch the usual pair
    if not tool_calls:
        default_tickers = tickers or ["SPY"]
        _logger.info(
            "  · Gemini proposed no tools — defaulting to market+news for %s",
            default_tickers,
        )
        tool_calls = [
            ("get_market_data", {"symbols": default_tickers, "include_history": True}),
            (
                "get_news_and_sentiment",
                {"companies": [_KNOWN_TICKERS.get(t, t) for t in default_tickers]},
            ),
        ]
    else:
        _logger.info(
            "  · Gemini proposed tools: %s",
            [name for name, _ in tool_calls],
        )

    # --- Turn 2: execute each requested tool ---
    tool_results: Dict[str, Any] = {}
    tools_seen: List[str] = []
    progress = 20

    for tool_name, tool_args in tool_calls:
        func = _TOOL_MAP.get(tool_name)
        if func is None:
            continue
        tools_seen.append(tool_name)
        progress = min(progress + 14, 80)
        yield {
            "type": "agent_step",
            "step": TOOL_PROGRESS.get(tool_name, f"Running {tool_name}…"),
            "tool": tool_name,
            "progress": progress,
        }
        try:
            # Some tools use different kwarg names — reconcile here.
            if tool_name == "query_sec_filings":
                tool_args.setdefault("query", query)
            if tool_name == "get_social_trends":
                tool_args.setdefault("tickers", tickers)
                tool_args.setdefault(
                    "companies", [_KNOWN_TICKERS.get(t, t) for t in tickers]
                )
            t0 = time.time()
            _logger.info(
                "  → running tool: %s args=%s", tool_name, list(tool_args.keys())
            )
            result = await func(**tool_args)
            _logger.info(
                "  ✓ tool %s finished in %.2fs", tool_name, time.time() - t0
            )
            tool_results[tool_name] = result
        except Exception as exc:
            _logger.exception("  ✗ tool %s failed", tool_name)
            tool_results[tool_name] = {"error": str(exc)}

    yield {
        "type": "agent_step",
        "step": "Synthesizing research findings…",
        "progress": 88,
    }

    # --- Turn 3: ask Gemini to synthesize the final report JSON ---
    trimmed_results = _trim_for_prompt(tool_results)
    synthesis_prompt = (
        AGENT_INSTRUCTION
        + "\n\n---\nResearch query: "
        + query
        + f"\nCompanies: {', '.join(tickers) if tickers else 'inferred from query'}\n"
        + "\nTool results (JSON):\n"
        + trimmed_results
        + "\n\nReturn ONLY the JSON report described above, wrapped in a ```json code fence."
    )

    synth_model = genai.GenerativeModel(settings.GEMINI_MODEL)
    final_text = ""
    try:
        t0 = time.time()
        _logger.info("  · Gemini synthesis call…")
        synth_response = await asyncio.to_thread(
            synth_model.generate_content, synthesis_prompt
        )
        final_text = getattr(synth_response, "text", "") or ""
        _logger.info(
            "  ✓ Gemini synthesis returned %d chars in %.2fs",
            len(final_text),
            time.time() - t0,
        )
    except Exception:
        _logger.exception("  ✗ Gemini synthesis call failed")

    parsed = _parse_report_json(final_text)

    # Ensure the section stream carries raw data too, not just LLM narrative
    parsed = _merge_tool_data_into_sections(parsed, tool_results, tickers)

    async for ev in _stream_sections(parsed):
        yield ev

    yield {
        "type": "final",
        "companies": parsed.get("companies") or tickers,
        "tools_used": tools_seen,
        "raw_json": parsed,
    }


def _trim_for_prompt(results: Dict[str, Any]) -> str:
    """Trim oversized arrays so we stay within prompt budget."""
    compact: Dict[str, Any] = {}
    for name, payload in results.items():
        if not isinstance(payload, dict):
            compact[name] = payload
            continue
        trimmed = {}
        for k, v in payload.items():
            if isinstance(v, dict):
                # Drop history arrays from market data — keep the rest.
                sub = {kk: vv for kk, vv in v.items() if kk != "history"}
                trimmed[k] = sub
            else:
                trimmed[k] = v
        compact[name] = trimmed
    return json.dumps(compact, default=str)[:12000]


def _merge_tool_data_into_sections(
    report: Dict[str, Any],
    tool_results: Dict[str, Any],
    tickers: List[str],
) -> Dict[str, Any]:
    """Ensure sections carry raw tool output even if the LLM omitted it."""
    sections = report.setdefault("sections", {})
    if "get_market_data" in tool_results:
        market = sections.setdefault("market", {})
        if not market.get("data"):
            market["data"] = tool_results["get_market_data"]
        market.setdefault("sources", ["Financial Modeling Prep", "Yahoo Finance"])
    if "get_news_and_sentiment" in tool_results:
        news = sections.setdefault("news", {})
        news_payload = tool_results["get_news_and_sentiment"]
        if isinstance(news_payload, dict):
            all_articles: List[Dict[str, Any]] = []
            for v in news_payload.values():
                if isinstance(v, dict):
                    all_articles.extend(v.get("articles") or [])
            if not news.get("articles"):
                news["articles"] = all_articles[:20]
            if not news.get("sentiment_by_company"):
                news["sentiment_by_company"] = {
                    c: {
                        "score": v.get("aggregate_sentiment"),
                        "score_0_100": v.get("sentiment_score_0_100"),
                        "label": v.get("sentiment_label"),
                        "positive": v.get("positive_count"),
                        "neutral": v.get("neutral_count"),
                        "negative": v.get("negative_count"),
                    }
                    for c, v in news_payload.items()
                    if isinstance(v, dict)
                }
        news.setdefault("sources", ["NewsAPI", "GNews"])
    if not report.get("companies"):
        report["companies"] = tickers

    # Build chat_context so the follow-up chat can chain off key facts.
    if not report.get("chat_context"):
        market_data = (sections.get("market") or {}).get("data") or {}
        key_metrics: Dict[str, Any] = {}
        for sym, q in market_data.items():
            if not isinstance(q, dict):
                continue
            key_metrics[sym] = {
                "price": q.get("price"),
                "change_pct": q.get("change_pct"),
                "market_cap": q.get("market_cap"),
                "pe_ratio": q.get("pe_ratio") or q.get("pe_ratio_ttm"),
                "revenue_growth": q.get("revenue_growth")
                or q.get("revenue_growth_ttm"),
                "gross_margins": q.get("gross_margins") or q.get("gross_margins_ttm"),
            }
        synth_summary = (sections.get("synthesis") or {}).get("summary") or ""
        report["chat_context"] = {
            "companies": report.get("companies") or tickers,
            "key_metrics": key_metrics,
            "summary_for_followup": synth_summary[:1500] if synth_summary else "",
        }
    return report


def _parse_report_json(text: str) -> Dict[str, Any]:
    if not text:
        return {"sections": {}}
    # Strip optional ```json fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    # Try progressively wider JSON spans if the first parse fails.
    for attempt in (candidate, _best_effort_json(candidate)):
        if not attempt:
            continue
        try:
            return json.loads(attempt)
        except Exception:
            continue
    return {
        "sections": {
            "synthesis": {"summary": text.strip()},
        }
    }


def _best_effort_json(text: str) -> Optional[str]:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    return text[start : end + 1]


# --------------------------------------------------------------------------
# Fallback path — runs tools directly, no LLM.
# --------------------------------------------------------------------------


async def _run_fallback(
    query: str,
    tickers: List[str],
    time_period: Optional[str],
) -> AsyncIterator[Dict[str, Any]]:
    _ = time_period
    if not tickers:
        tickers = ["SPY"]
    planned = _classify_tools(query)

    yield {
        "type": "agent_step",
        "step": f"Running tools directly: {', '.join(planned)}",
        "progress": 15,
    }

    market_data: Dict[str, Any] = {}
    news_data: Dict[str, Any] = {}
    filings_data: Dict[str, Any] = {}
    social_data: Dict[str, Any] = {}

    progress = 20
    for step in planned:
        yield {
            "type": "agent_step",
            "step": TOOL_PROGRESS.get(step, step),
            "tool": step,
            "progress": progress,
        }
        progress = min(progress + 15, 80)
        try:
            if step == "get_market_data":
                market_data = await tool_module.get_market_data(tickers)
            elif step == "get_news_and_sentiment":
                companies = [_KNOWN_TICKERS.get(t, t) for t in tickers]
                news_data = await tool_module.get_news_and_sentiment(companies)
            elif step == "query_sec_filings":
                filings_data = await tool_module.query_sec_filings(tickers, query)
            elif step == "get_social_trends":
                companies = [_KNOWN_TICKERS.get(t, t) for t in tickers]
                social_data = await tool_module.get_social_trends(companies, tickers)
        except Exception:
            _logger.exception("Fallback tool %s failed", step)

    report = _assemble_fallback_report(
        query=query,
        tickers=tickers,
        market_data=market_data,
        news_data=news_data,
        filings_data=filings_data,
        social_data=social_data,
    )

    yield {
        "type": "agent_step",
        "step": "Synthesizing research findings…",
        "progress": 90,
    }

    async for ev in _stream_sections(report):
        yield ev

    yield {
        "type": "final",
        "companies": tickers,
        "tools_used": planned,
        "raw_json": report,
    }


def _fmt_usd_large(v: Any) -> str:
    if v is None:
        return "—"
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v)
    for unit, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if abs(n) >= unit:
            return f"${n / unit:.2f}{suffix}"
    return f"${n:,.0f}"


def _assemble_fallback_report(
    *,
    query: str,
    tickers: List[str],
    market_data: Dict[str, Any],
    news_data: Dict[str, Any],
    filings_data: Dict[str, Any],
    social_data: Dict[str, Any],
) -> Dict[str, Any]:
    sections: Dict[str, Any] = {}

    if market_data:
        key_insights: List[str] = []
        for sym, q in market_data.items():
            if q.get("price") and q.get("change_pct") is not None:
                key_insights.append(
                    f"{sym} trades at ${q['price']:.2f} "
                    f"({q['change_pct']:+.2f}%) with market cap {_fmt_usd_large(q.get('market_cap'))}"
                )
        narrative = " ".join(key_insights) or "Market data fetched."
        sections["market"] = {
            "data": market_data,
            "narrative": narrative + " [Source: Yahoo Finance]",
            "key_insights": key_insights,
            "sources": ["Yahoo Finance", "Financial Modeling Prep"],
        }

    if news_data:
        sentiment_line: List[str] = []
        for company, payload in news_data.items():
            sentiment_line.append(
                f"{company}: {payload.get('sentiment_label', 'neutral')} "
                f"({payload.get('article_count', 0)} articles)"
            )
        sections["news"] = {
            "articles": [
                a
                for payload in news_data.values()
                for a in (payload.get("articles") or [])[:8]
            ],
            "sentiment_by_company": {
                c: {
                    "score": v.get("aggregate_sentiment"),
                    "score_0_100": v.get("sentiment_score_0_100"),
                    "label": v.get("sentiment_label"),
                    "positive": v.get("positive_count"),
                    "neutral": v.get("neutral_count"),
                    "negative": v.get("negative_count"),
                }
                for c, v in news_data.items()
            },
            "narrative": " · ".join(sentiment_line) + " [Source: NewsAPI, GNews]",
            "sources": ["NewsAPI", "GNews"],
        }

    if filings_data:
        passages: List[Dict[str, Any]] = []
        for t, payload in filings_data.items():
            for p in payload.get("rag_passages", []):
                passages.append({**p, "ticker": t})
        sections["filings"] = {
            "passages": passages,
            "recent_8k_by_ticker": {
                t: payload.get("recent_8k") for t, payload in filings_data.items()
            },
            "narrative": (
                f"Retrieved {len(passages)} filing passage(s) via semantic search"
                " over ingested 10-K/10-Q text. [Source: SEC EDGAR + ChromaDB RAG]"
            ),
            "sources": ["SEC EDGAR", "ChromaDB RAG"],
        }

    if social_data:
        highlights: List[str] = []
        for t, payload in social_data.items():
            trend = (payload.get("google_trends") or {}).get("current_score")
            mentions = payload.get("reddit_mention_count", 0)
            highlights.append(
                f"{t}: Google Trends {trend if trend is not None else 'n/a'}, "
                f"{mentions} Reddit mentions"
            )
        sections["social"] = {
            "data": social_data,
            "narrative": " · ".join(highlights) + " [Source: Google Trends, Reddit]",
            "sources": ["Google Trends", "Reddit"],
        }

    # Synthesis + risks
    synthesis_lines = []
    if "market" in sections:
        synthesis_lines.append(sections["market"]["narrative"])
    if "news" in sections:
        synthesis_lines.append(sections["news"]["narrative"])
    if "filings" in sections:
        synthesis_lines.append(sections["filings"]["narrative"])
    if "social" in sections:
        synthesis_lines.append(sections["social"]["narrative"])

    sections["synthesis"] = {
        "summary": (
            "Direct-tool summary for "
            + (", ".join(tickers) if tickers else "the query")
            + ":\n\n"
            + "\n\n".join(synthesis_lines or ["No data retrieved."])
            + "\n\nFor full AI analysis, configure GEMINI_API_KEY and retry."
        ),
        "comparison_table": _build_comparison_table(market_data) if len(tickers) > 1 else [],
        "key_findings": [
            f"Analyzed query: {query}",
            f"Coverage: {', '.join(tickers)}",
            f"Tools used: {', '.join(sections.keys())}",
        ],
    }

    sections["risks"] = _heuristic_risks(market_data, news_data)

    return {
        "companies": tickers,
        "query_intent": query,
        "sections": sections,
    }


def _build_comparison_table(market_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not market_data:
        return []
    tickers = list(market_data.keys())
    metrics: List[Tuple[str, str]] = [
        ("Price", "price"),
        ("P/E (TTM)", "pe_ratio"),
        ("Revenue (TTM)", "revenue"),
        ("Revenue growth", "revenue_growth"),
        ("Gross margin", "gross_margins"),
        ("Market cap", "market_cap"),
    ]
    rows: List[Dict[str, Any]] = []
    for label, key in metrics:
        row: Dict[str, Any] = {"metric": label}
        for t in tickers:
            v = market_data[t].get(key)
            if key in ("revenue", "market_cap"):
                row[t] = _fmt_usd_large(v)
            elif key in ("revenue_growth", "gross_margins") and v is not None:
                row[t] = f"{v * 100:.1f}%"
            elif v is None:
                row[t] = "—"
            else:
                row[t] = v
        rows.append(row)
    return rows


def _heuristic_risks(
    market_data: Dict[str, Any],
    news_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    for sym, q in (market_data or {}).items():
        if q.get("beta") and q["beta"] and q["beta"] > 1.5:
            risks.append(
                {
                    "risk": f"High beta ({q['beta']:.2f}) for {sym}",
                    "severity": "medium",
                    "detail": (
                        f"{sym} shows above-market volatility which can amplify"
                        " drawdowns during broader market weakness."
                    ),
                }
            )
        if q.get("pe_ratio") and q["pe_ratio"] and q["pe_ratio"] > 40:
            risks.append(
                {
                    "risk": f"Elevated P/E for {sym}",
                    "severity": "medium",
                    "detail": (
                        f"{sym} trades at {q['pe_ratio']:.1f}x earnings — implies"
                        " aggressive growth assumptions."
                    ),
                }
            )
    for company, payload in (news_data or {}).items():
        if payload.get("sentiment_label") == "negative":
            risks.append(
                {
                    "risk": f"Negative news sentiment for {company}",
                    "severity": "high",
                    "detail": (
                        f"Aggregate news sentiment is negative across "
                        f"{payload.get('article_count', 0)} articles."
                    ),
                }
            )
    if not risks:
        risks.append(
            {
                "risk": "Limited data available",
                "severity": "low",
                "detail": "Few data points retrieved — broaden the query for a stronger signal.",
            }
        )
    return risks[:5]


# --------------------------------------------------------------------------
# Shared: turn a parsed report into a stream of section events.
# --------------------------------------------------------------------------

_SECTION_ORDER = ("market", "news", "filings", "social", "synthesis", "risks")


async def _stream_sections(report: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
    sections = (report or {}).get("sections") or {}
    # Emit known sections in a stable order, then any extras.
    emitted: set[str] = set()
    for key in _SECTION_ORDER:
        if key in sections:
            emitted.add(key)
            yield {
                "type": "section",
                "section": key,
                "data": sections[key],
            }
    for key, value in sections.items():
        if key in emitted:
            continue
        yield {"type": "section", "section": key, "data": value}
