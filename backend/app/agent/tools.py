"""The five research tools the agent can call.

Every tool returns a JSON-serializable dict. No external credentials are
required to *import* this module — each tool degrades gracefully when its
upstream credentials are missing.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
import yfinance as yf

from ..core.config import settings
from ..services.rag_service import rag_service

try:
    from textblob import TextBlob
except Exception:  # pragma: no cover - optional dep
    TextBlob = None  # type: ignore[assignment]

_logger = logging.getLogger(__name__)


# ---------- Tool 1: market data ----------

def _fmp_quote_blocking(symbol: str) -> Optional[Dict[str, Any]]:
    """Primary quote source — FMP /stable/quote. Reliable on free tier."""
    if not settings.FMP_API_KEY:
        return None
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                "https://financialmodelingprep.com/stable/quote",
                params={"symbol": symbol.upper(), "apikey": settings.FMP_API_KEY},
            )
        if resp.status_code != 200:
            return None
        rows = resp.json() or []
        if not rows or not isinstance(rows, list):
            return None
        q = rows[0]
    except Exception:
        _logger.exception("FMP quote failed for %s", symbol)
        return None
    change = q.get("change")
    price = q.get("price")
    prev_close = None
    try:
        if price is not None and change is not None:
            prev_close = float(price) - float(change)
    except (TypeError, ValueError):
        prev_close = None
    return {
        "symbol": q.get("symbol") or symbol.upper(),
        "name": q.get("name") or symbol.upper(),
        "price": price,
        "change_pct": q.get("changePercentage"),
        "market_cap": q.get("marketCap"),
        "pe_ratio": q.get("pe"),
        "forward_pe": None,
        "eps": q.get("eps"),
        "revenue": None,
        "revenue_growth": None,
        "gross_margins": None,
        "profit_margins": None,
        "week_52_high": q.get("yearHigh"),
        "week_52_low": q.get("yearLow"),
        "volume": q.get("volume"),
        "beta": None,
        "sector": q.get("exchange") or "",
        "industry": "",
        "description": "",
        "previous_close": prev_close,
        "source": "Financial Modeling Prep",
        "source_url": f"https://financialmodelingprep.com/financial-summary/{symbol.upper()}",
    }


def _alpha_quote_blocking(symbol: str) -> Optional[Dict[str, Any]]:
    """Last-resort fallback — Alpha Vantage GLOBAL_QUOTE. Covers ETFs."""
    if not settings.ALPHA_VANTAGE_KEY:
        return None
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "GLOBAL_QUOTE",
                    "symbol": symbol.upper(),
                    "apikey": settings.ALPHA_VANTAGE_KEY,
                },
            )
        if resp.status_code != 200:
            return None
        q = (resp.json() or {}).get("Global Quote") or {}
        price_s = q.get("05. price")
        if not price_s:
            return None
        price = float(price_s)
        change = None
        try:
            change = float(q.get("09. change") or 0)
        except (TypeError, ValueError):
            change = None
        pct_str = (q.get("10. change percent") or "").rstrip("%")
        try:
            change_pct = float(pct_str) if pct_str else None
        except ValueError:
            change_pct = None
    except Exception:
        _logger.exception("Alpha Vantage quote failed for %s", symbol)
        return None
    return {
        "symbol": symbol.upper(),
        "name": symbol.upper(),
        "price": price,
        "change_pct": change_pct,
        "market_cap": None,
        "pe_ratio": None,
        "forward_pe": None,
        "eps": None,
        "revenue": None,
        "revenue_growth": None,
        "gross_margins": None,
        "profit_margins": None,
        "week_52_high": float(q.get("03. high") or 0) or None,
        "week_52_low": float(q.get("04. low") or 0) or None,
        "volume": int(q.get("06. volume") or 0) or None,
        "beta": None,
        "sector": "",
        "industry": "",
        "description": "",
        "source": "Alpha Vantage",
        "source_url": "https://www.alphavantage.co/",
    }


async def _fmp_supplement(symbol: str) -> Dict[str, Any]:
    if not settings.FMP_API_KEY:
        return {}
    base = "https://financialmodelingprep.com/api/v3"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            q = await client.get(
                f"{base}/income-statement/{symbol}",
                params={"limit": 4, "apikey": settings.FMP_API_KEY},
            )
            earnings = await client.get(
                f"{base}/historical/earning_calendar/{symbol}",
                params={"limit": 4, "apikey": settings.FMP_API_KEY},
            )
            ratios = await client.get(
                f"{base}/ratios-ttm/{symbol}",
                params={"apikey": settings.FMP_API_KEY},
            )
        except Exception:
            _logger.exception("FMP fetch failed for %s", symbol)
            return {}
    out: Dict[str, Any] = {}
    if q.status_code == 200:
        try:
            rows = q.json()
            out["quarterly_revenue"] = [
                {"period": r.get("date"), "revenue": r.get("revenue")}
                for r in rows[:4]
            ]
        except Exception:
            pass
    if earnings.status_code == 200:
        try:
            rows = earnings.json()
            out["earnings_history"] = [
                {
                    "date": r.get("date"),
                    "eps": r.get("eps"),
                    "eps_estimated": r.get("epsEstimated"),
                    "revenue": r.get("revenue"),
                    "revenue_estimated": r.get("revenueEstimated"),
                }
                for r in rows[:4]
            ]
        except Exception:
            pass
    if ratios.status_code == 200:
        try:
            rows = ratios.json()
            if rows and isinstance(rows, list):
                r = rows[0]
                # Only set when Yahoo didn't already provide it — these overwrite
                # the Optional/None placeholders that come from FMP /quote.
                out["revenue_growth_ttm"] = r.get("revenueGrowthTTM")
                out["gross_margins_ttm"] = r.get("grossProfitMarginTTM")
                out["profit_margins_ttm"] = r.get("netProfitMarginTTM")
                out["return_on_equity_ttm"] = r.get("returnOnEquityTTM")
                out["debt_to_equity_ttm"] = r.get("debtEquityRatioTTM")
                out["pe_ratio_ttm"] = r.get("peRatioTTM")
                out["dividend_yield_ttm"] = r.get("dividendYielTTM") or r.get(
                    "dividendYieldTTM"
                )
        except Exception:
            pass
    return out


def _fetch_yf_blocking(symbol: str, include_history: bool) -> Dict[str, Any]:
    """Best-effort yfinance fetch. Returns a dict with None values when
    Yahoo rate-limits, rather than raising — history is tried separately
    because it uses a different Yahoo endpoint that's often still working
    even when `.info` is 429'd.
    """
    from ..core.market import _silence_stderr  # local import to avoid cycles

    with _silence_stderr():
        ticker = yf.Ticker(symbol.upper())
        try:
            info = ticker.info or {}
        except Exception:
            info = {}
        hist = None
        if include_history:
            try:
                hist = ticker.history(period="1mo", interval="1d", auto_adjust=False)
            except Exception:
                hist = None
    result: Dict[str, Any] = {
        "symbol": symbol.upper(),
        "name": info.get("longName") or info.get("shortName"),
        "price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "change_pct": info.get("regularMarketChangePercent"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "eps": info.get("trailingEps"),
        "revenue": info.get("totalRevenue"),
        "revenue_growth": info.get("revenueGrowth"),
        "gross_margins": info.get("grossMargins"),
        "profit_margins": info.get("profitMargins"),
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
        "volume": info.get("volume"),
        "beta": info.get("beta"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": (info.get("longBusinessSummary") or "")[:500] or None,
        "source": "Yahoo Finance (yfinance)",
        "source_url": f"https://finance.yahoo.com/quote/{symbol.upper()}",
    }
    if include_history:
        if hist is not None and len(hist) > 0:
            try:
                result["history"] = [
                    {
                        "date": str(idx.date()),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else None,
                    }
                    for idx, row in hist.iterrows()
                    if row["Close"] == row["Close"]
                ]
            except Exception:
                result["history"] = []
        else:
            result["history"] = []
    return result


def _merge_quote(base: Dict[str, Any], extra: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Fill None values in `base` with values from `extra`."""
    if not extra:
        return base
    merged = dict(base)
    for k, v in extra.items():
        if merged.get(k) is None and v is not None:
            merged[k] = v
    return merged


async def get_market_data(
    symbols: List[str],
    include_history: bool = True,
) -> Dict[str, Any]:
    """Fetch live market data with an FMP → yfinance → Alpha Vantage cascade.

    FMP first (no IP throttling on free tier), yfinance for richer
    fundamentals (sector/industry/description + history), Alpha Vantage
    as a last resort for ETFs.
    """
    results: Dict[str, Any] = {}
    symbols_up = [s.strip().upper() for s in symbols if s and s.strip()][:8]
    for symbol in symbols_up:
        # 1) FMP baseline — fast + reliable
        fmp_quote = await asyncio.to_thread(_fmp_quote_blocking, symbol)
        # 2) yfinance enrichment — sector / industry / description / fundamentals / history
        yf_quote = await asyncio.to_thread(_fetch_yf_blocking, symbol, include_history)

        # Start with whichever has a price; merge the other on top for missing fields.
        if fmp_quote and fmp_quote.get("price") is not None:
            quote = _merge_quote(fmp_quote, yf_quote)
        elif yf_quote.get("price") is not None:
            quote = _merge_quote(yf_quote, fmp_quote)
        else:
            # 3) Alpha Vantage last-resort for ETFs / anything both missed
            av_quote = await asyncio.to_thread(_alpha_quote_blocking, symbol)
            quote = _merge_quote(av_quote or {}, _merge_quote(fmp_quote or {}, yf_quote))
            if not quote.get("symbol"):
                quote["symbol"] = symbol

        # Preserve history from yfinance if FMP took precedence.
        if "history" not in quote and "history" in yf_quote:
            quote["history"] = yf_quote.get("history") or []

        # Supplement with FMP earnings / quarterly revenue where available.
        fmp_extra = await _fmp_supplement(symbol)
        quote.update(fmp_extra)
        results[symbol] = quote
    return results


# ---------- Tool 2: news + sentiment ----------

def _analyze_sentiment(text: str) -> Dict[str, Any]:
    if not text:
        return {"score": 0.0, "label": "neutral"}
    if TextBlob is None:
        return {"score": 0.0, "label": "neutral"}
    try:
        polarity = float(TextBlob(text).sentiment.polarity)
    except Exception:
        polarity = 0.0
    if polarity > 0.1:
        label = "positive"
    elif polarity < -0.1:
        label = "negative"
    else:
        label = "neutral"
    return {"score": polarity, "label": label}


def _dedupe_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for a in articles:
        key = (a.get("title") or "").strip().lower()[:120]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


async def _fetch_newsapi(client: httpx.AsyncClient, company: str) -> List[Dict[str, Any]]:
    if not settings.NEWS_API_KEY:
        return []
    try:
        r = await client.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": company,
                "sortBy": "publishedAt",
                "language": "en",
                "pageSize": 10,
                "apiKey": settings.NEWS_API_KEY,
            },
            timeout=12.0,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return [
            {
                "title": a.get("title") or "",
                "description": a.get("description") or "",
                "url": a.get("url"),
                "source": (a.get("source") or {}).get("name") or "",
                "published_at": a.get("publishedAt"),
                "source_type": "NewsAPI",
            }
            for a in data.get("articles", [])[:10]
            if a.get("title")
        ]
    except Exception:
        _logger.exception("NewsAPI fetch failed")
        return []


async def _fetch_gnews(client: httpx.AsyncClient, company: str) -> List[Dict[str, Any]]:
    if not settings.GNEWS_API_KEY:
        return []
    try:
        r = await client.get(
            "https://gnews.io/api/v4/search",
            params={
                "q": company,
                "max": 10,
                "token": settings.GNEWS_API_KEY,
                "lang": "en",
            },
            timeout=12.0,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return [
            {
                "title": a.get("title") or "",
                "description": a.get("description") or "",
                "url": a.get("url"),
                "source": (a.get("source") or {}).get("name") or "",
                "published_at": a.get("publishedAt"),
                "source_type": "GNews",
            }
            for a in data.get("articles", [])[:10]
            if a.get("title")
        ]
    except Exception:
        _logger.exception("GNews fetch failed")
        return []


async def get_news_and_sentiment(
    companies: List[str],
    days_back: int = 30,
    max_articles: int = 20,
) -> Dict[str, Any]:
    """Fetch recent news and analyze sentiment.

    Returns per-company article lists plus aggregate scores. Use this for any
    question about news, recent events, announcements, sentiment, analyst
    ratings, or market reaction.
    """
    _ = days_back  # reserved for date-filtering in a future iteration
    results: Dict[str, Any] = {}
    async with httpx.AsyncClient() as client:
        for company in companies:
            articles: List[Dict[str, Any]] = []
            articles += await _fetch_newsapi(client, company)
            articles += await _fetch_gnews(client, company)
            articles = _dedupe_articles(articles)[:max_articles]

            for art in articles:
                text = f"{art.get('title', '')} {art.get('description', '')}".strip()
                s = _analyze_sentiment(text)
                art["sentiment_score"] = s["score"]
                art["sentiment_label"] = s["label"]

            scores = [a["sentiment_score"] for a in articles if "sentiment_score" in a]
            avg = (sum(scores) / len(scores)) if scores else 0.0
            positive = sum(1 for a in articles if a.get("sentiment_label") == "positive")
            negative = sum(1 for a in articles if a.get("sentiment_label") == "negative")
            neutral = len(articles) - positive - negative
            label = "positive" if avg > 0.1 else "negative" if avg < -0.1 else "neutral"

            results[company] = {
                "articles": articles,
                "aggregate_sentiment": avg,
                "sentiment_label": label,
                "sentiment_score_0_100": int((avg + 1) * 50),
                "article_count": len(articles),
                "positive_count": positive,
                "negative_count": negative,
                "neutral_count": neutral,
                "sources": ["NewsAPI" if settings.NEWS_API_KEY else None, "GNews" if settings.GNEWS_API_KEY else None],
            }
            results[company]["sources"] = [s for s in results[company]["sources"] if s]
    return results


# ---------- Tool 3: SEC filings (RAG) ----------

async def _fetch_recent_8k(ticker: str) -> List[Dict[str, Any]]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
    url = "https://efts.sec.gov/LATEST/search-index"
    params = {
        "q": f'"{ticker}"',
        "forms": "8-K",
        "dateRange": "custom",
        "startdt": cutoff,
    }
    headers = {"User-Agent": settings.SEC_USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params, headers=headers)
        if r.status_code != 200:
            return []
        data = r.json()
        hits = (data.get("hits") or {}).get("hits") or []
        out = []
        for hit in hits[:5]:
            src = hit.get("_source") or {}
            out.append(
                {
                    "accession": hit.get("_id"),
                    "form": src.get("form") or "8-K",
                    "filed": src.get("file_date"),
                    "description": (src.get("display_names") or [""])[0],
                    "url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={src.get('ciks', [''])[0]}&type=8-K",
                }
            )
        return out
    except Exception:
        _logger.exception("SEC 8-K search failed for %s", ticker)
        return []


async def query_sec_filings(
    tickers: List[str],
    query: str,
    filing_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Search SEC filings and earnings transcripts via vector similarity.

    Use for questions about 10-K/10-Q details, annual/quarterly reports,
    balance sheet items, risk factors, MD&A, or management guidance.
    """
    _ = filing_types  # handled by metadata already present in the index
    results: Dict[str, Any] = {}
    for ticker in tickers:
        ticker_up = ticker.upper()
        rag_hits, eight_ks = await asyncio.gather(
            rag_service.query(
                query_text=f"{query} {ticker_up}",
                ticker_filter=[ticker_up],
                n_results=4,
            ),
            _fetch_recent_8k(ticker_up),
        )
        results[ticker_up] = {
            "rag_passages": rag_hits,
            "recent_8k": eight_ks,
            "source": "SEC EDGAR + ChromaDB RAG",
        }
    return results


# ---------- Tool 4: social trends ----------

def _fetch_google_trends_blocking(ticker: str) -> Dict[str, Any]:
    try:
        from pytrends.request import TrendReq
    except Exception:
        return {"values": [], "dates": [], "current_score": None}
    try:
        pytrends = TrendReq(hl="en-US", tz=360)
        pytrends.build_payload([ticker], timeframe="today 3-m")
        df = pytrends.interest_over_time()
        if ticker not in df.columns:
            return {"values": [], "dates": [], "current_score": None}
        values = [int(v) for v in df[ticker].tolist()]
        dates = [str(d.date()) for d in df.index.tolist()]
        return {
            "values": values,
            "dates": dates,
            "current_score": values[-1] if values else None,
        }
    except Exception:
        _logger.exception("pytrends failed for %s", ticker)
        return {"values": [], "dates": [], "current_score": None}


def _fetch_reddit_blocking(ticker: str) -> List[Dict[str, Any]]:
    if not (settings.REDDIT_CLIENT_ID and settings.REDDIT_CLIENT_SECRET):
        return []
    try:
        import praw
    except Exception:
        return []
    try:
        reddit = praw.Reddit(
            client_id=settings.REDDIT_CLIENT_ID,
            client_secret=settings.REDDIT_CLIENT_SECRET,
            user_agent=settings.REDDIT_USER_AGENT,
        )
        posts: List[Dict[str, Any]] = []
        for sub in ("investing", "stocks", "wallstreetbets", "SecurityAnalysis"):
            try:
                for post in reddit.subreddit(sub).search(
                    ticker, time_filter="month", limit=10
                ):
                    posts.append(
                        {
                            "title": post.title,
                            "score": int(post.score or 0),
                            "upvote_ratio": float(post.upvote_ratio or 0),
                            "num_comments": int(post.num_comments or 0),
                            "url": f"https://reddit.com{post.permalink}",
                            "created_utc": float(post.created_utc or 0),
                            "subreddit": sub,
                        }
                    )
            except Exception:
                _logger.exception("Reddit search failed for %s/%s", sub, ticker)
        return posts
    except Exception:
        _logger.exception("Reddit client init failed")
        return []


async def get_social_trends(
    companies: List[str],
    tickers: List[str],
) -> Dict[str, Any]:
    """Fetch social sentiment and search-trend data.

    Returns Google Trends interest-over-time plus Reddit mentions from the
    top investing subreddits.
    """
    _ = companies  # kept for API parity; currently only `tickers` drives results
    results: Dict[str, Any] = {}
    for ticker in tickers:
        ticker_up = ticker.upper()
        trends_task = asyncio.to_thread(_fetch_google_trends_blocking, ticker_up)
        reddit_task = asyncio.to_thread(_fetch_reddit_blocking, ticker_up)
        trends, reddit_posts = await asyncio.gather(trends_task, reddit_task)
        reddit_sorted = sorted(
            reddit_posts, key=lambda p: p.get("score", 0), reverse=True
        )[:10]
        avg_score = (
            sum(p["score"] for p in reddit_sorted) / len(reddit_sorted)
            if reddit_sorted
            else 0
        )
        results[ticker_up] = {
            "google_trends": trends,
            "reddit_posts": reddit_sorted,
            "reddit_mention_count": len(reddit_posts),
            "reddit_avg_score": avg_score,
            "source": "Google Trends (pytrends) + Reddit PRAW",
        }
    return results


# ---------- Tool 5: web scraping (fallback) ----------

async def web_scrape(
    urls: List[str],
    extraction_goal: str = "",
) -> Dict[str, Any]:
    """Scrape web pages with Playwright — use only as a last resort."""
    _ = extraction_goal
    results: Dict[str, Any] = {}
    try:
        from playwright.async_api import async_playwright
    except Exception:
        return {"error": "playwright not available"}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                for url in urls[:3]:
                    try:
                        page = await browser.new_page()
                        await page.set_extra_http_headers(
                            {
                                "User-Agent": (
                                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
                                    " AppleWebKit/537.36 (KHTML, like Gecko)"
                                    " Chrome/124.0.0.0 Safari/537.36"
                                )
                            }
                        )
                        await page.goto(url, timeout=15000)
                        await page.wait_for_timeout(1500)
                        content = await page.inner_text("body")
                        cleaned = " ".join((content or "").split())[:3000]
                        results[url] = {"content": cleaned, "source": url}
                        await page.close()
                    except Exception as exc:
                        results[url] = {"error": str(exc), "source": url}
            finally:
                await browser.close()
    except Exception as exc:
        return {"error": f"playwright launch failed: {exc}"}
    return results


# ---------- Tool 6: web_search (Gemini + Google Search grounding) ----------


async def web_search(
    query: str,
    focus_companies: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Live Google search via Gemini's grounding tool.

    Returns the grounded answer plus the source URLs Gemini cited. Use this
    when no ticker is detected, when the built-in data tools returned
    nothing useful, or when the query is about current events outside of
    standard market/news/filings coverage (macro, regulation, industry).
    """
    if not settings.GEMINI_API_KEY:
        return {"answer": "", "sources": [], "error": "GEMINI_API_KEY not configured"}

    try:
        # Use the google-genai SDK (which supports the current google_search
        # tool on gemini-2.5 models). The older google.generativeai SDK only
        # exposes the retired google_search_retrieval form.
        from google import genai as genai_new
        from google.genai import types as genai_types

        client = genai_new.Client(api_key=settings.GEMINI_API_KEY)
        companies_line = (
            f"Focus companies: {', '.join(focus_companies)}\n"
            if focus_companies
            else ""
        )
        prompt = (
            f"{companies_line}"
            f"Research question: {query}\n"
            "Answer in 2-3 short paragraphs grounded in current web sources. "
            "Cite specific numbers, dates, and named sources inline."
        )
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
            ),
        )
    except Exception as exc:
        _logger.exception("web_search (Gemini grounding) failed")
        return {"answer": "", "sources": [], "error": str(exc)}

    answer = getattr(resp, "text", "") or ""

    # Extract source URLs from grounding metadata when available.
    sources: List[Dict[str, str]] = []
    try:
        for cand in getattr(resp, "candidates", []) or []:
            meta = getattr(cand, "grounding_metadata", None)
            if meta is None:
                continue
            chunks = getattr(meta, "grounding_chunks", None) or []
            for ch in chunks:
                web = getattr(ch, "web", None)
                if web is None:
                    continue
                uri = getattr(web, "uri", None)
                title = getattr(web, "title", None)
                if uri:
                    sources.append({"title": title or uri, "url": uri})
    except Exception:
        _logger.debug("Could not parse grounding metadata", exc_info=True)

    return {
        "answer": answer,
        "sources": sources[:8],
        "source": "Gemini + Google Search grounding",
    }


TOOLS = [
    get_market_data,
    get_news_and_sentiment,
    query_sec_filings,
    get_social_trends,
    web_scrape,
    web_search,
]
