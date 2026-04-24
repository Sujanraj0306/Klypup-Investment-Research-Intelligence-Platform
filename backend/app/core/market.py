"""Market data helpers wrapping yfinance.

yfinance is synchronous and can be slow. Every helper runs inside
asyncio.to_thread so endpoints can fan out requests in parallel.

A tiny in-process cache keyed by (endpoint, symbol) uses the TTLs from
settings. Good enough for a single-instance dev setup; swap for Redis when
we scale out.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import yfinance as yf

from .cache import cache
from .config import settings

_logger = logging.getLogger(__name__)

# yfinance prints errors directly to stderr (bypassing logging), so we
# silence its loggers AND redirect stderr when we call into it. Set
# KLYPUP_YF_VERBOSE=1 in the environment to re-enable the noise.
for _name in ("yfinance", "peewee", "urllib3"):
    logging.getLogger(_name).setLevel(logging.CRITICAL)


@contextlib.contextmanager
def _silence_stderr():
    """Swallow raw stderr prints from yfinance when KLYPUP_YF_VERBOSE unset."""
    if os.environ.get("KLYPUP_YF_VERBOSE"):
        yield
        return
    with contextlib.redirect_stderr(io.StringIO()):
        yield


SECTOR_ETFS: List[Tuple[str, str]] = [
    ("XLK", "Technology"),
    ("XLF", "Financials"),
    ("XLV", "Healthcare"),
    ("XLE", "Energy"),
    ("XLI", "Industrials"),
    ("XLY", "Consumer Discretionary"),
    ("XLP", "Consumer Staples"),
    ("XLU", "Utilities"),
    ("XLB", "Materials"),
    ("XLRE", "Real Estate"),
    ("XLC", "Communication Services"),
]

# Universe for market movers — 50 well-known large caps.
MOVERS_UNIVERSE: List[str] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "AVGO", "LLY",
    "JPM", "V", "UNH", "XOM", "MA", "JNJ", "PG", "HD", "COST", "WMT",
    "MRK", "ABBV", "CVX", "BAC", "KO", "PEP", "ADBE", "CRM", "NFLX", "ORCL",
    "MCD", "TMO", "ABT", "AMD", "LIN", "CSCO", "ACN", "DIS", "WFC", "DHR",
    "INTC", "QCOM", "TXN", "NKE", "UBER", "IBM", "GE", "BA", "GS", "T",
]

# Small searchable catalog for the search endpoint. yfinance 0.2.38 doesn't
# expose a reliable symbol search, so we ship a curated list and do a
# case-insensitive substring match.
SEARCH_CATALOG: List[Dict[str, str]] = [
    {"symbol": s, "name": n, "exchange": "NASDAQ", "type": "EQUITY"}
    for s, n in [
        ("AAPL", "Apple Inc."),
        ("MSFT", "Microsoft Corporation"),
        ("GOOGL", "Alphabet Inc. (Class A)"),
        ("GOOG", "Alphabet Inc. (Class C)"),
        ("AMZN", "Amazon.com, Inc."),
        ("NVDA", "NVIDIA Corporation"),
        ("META", "Meta Platforms, Inc."),
        ("TSLA", "Tesla, Inc."),
        ("AVGO", "Broadcom Inc."),
        ("ADBE", "Adobe Inc."),
        ("NFLX", "Netflix, Inc."),
        ("AMD", "Advanced Micro Devices, Inc."),
        ("INTC", "Intel Corporation"),
        ("CSCO", "Cisco Systems, Inc."),
        ("QCOM", "QUALCOMM Incorporated"),
        ("TXN", "Texas Instruments Incorporated"),
        ("ORCL", "Oracle Corporation"),
        ("CRM", "Salesforce, Inc."),
        ("COST", "Costco Wholesale Corporation"),
        ("PEP", "PepsiCo, Inc."),
    ]
] + [
    {"symbol": s, "name": n, "exchange": "NYSE", "type": "EQUITY"}
    for s, n in [
        ("BRK-B", "Berkshire Hathaway Inc. (Class B)"),
        ("JPM", "JPMorgan Chase & Co."),
        ("V", "Visa Inc."),
        ("MA", "Mastercard Incorporated"),
        ("UNH", "UnitedHealth Group Incorporated"),
        ("XOM", "Exxon Mobil Corporation"),
        ("CVX", "Chevron Corporation"),
        ("JNJ", "Johnson & Johnson"),
        ("PG", "The Procter & Gamble Company"),
        ("HD", "The Home Depot, Inc."),
        ("WMT", "Walmart Inc."),
        ("LLY", "Eli Lilly and Company"),
        ("MRK", "Merck & Co., Inc."),
        ("ABBV", "AbbVie Inc."),
        ("BAC", "Bank of America Corporation"),
        ("KO", "The Coca-Cola Company"),
        ("MCD", "McDonald's Corporation"),
        ("TMO", "Thermo Fisher Scientific Inc."),
        ("ABT", "Abbott Laboratories"),
        ("DIS", "The Walt Disney Company"),
        ("GS", "The Goldman Sachs Group, Inc."),
        ("NKE", "NIKE, Inc."),
        ("BA", "The Boeing Company"),
        ("GE", "General Electric Company"),
        ("UBER", "Uber Technologies, Inc."),
        ("IBM", "International Business Machines Corporation"),
    ]
]


def _cache_get(key: str, _ttl: int) -> Any | None:
    # TTL is enforced by the shared cache at put time.
    return cache.get(key)


def _cache_put(key: str, value: Any, ttl: int = settings.QUOTE_CACHE_TTL) -> None:
    cache.set(key, value, ttl)


def _safe_num(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _quote_from_info(info: Dict[str, Any], history_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    price = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or (history_row.get("Close") if history_row else None)
    )
    prev_close = (
        info.get("regularMarketPreviousClose")
        or info.get("previousClose")
        or (history_row.get("PrevClose") if history_row else None)
        or (history_row.get("Open") if history_row else None)
    )
    price_n = _safe_num(price)
    prev_n = _safe_num(prev_close)
    change = None
    change_pct = None
    if price_n is not None and prev_n is not None and prev_n != 0:
        change = price_n - prev_n
        change_pct = (change / prev_n) * 100

    desc = info.get("longBusinessSummary") or ""
    if len(desc) > 300:
        desc = desc[:300].rstrip() + "…"

    return {
        "symbol": info.get("symbol") or "",
        "name": info.get("shortName") or info.get("longName") or info.get("symbol") or "",
        "price": price_n,
        "change": change,
        "changePct": change_pct,
        "volume": _safe_num(info.get("regularMarketVolume") or info.get("volume")),
        "marketCap": _safe_num(info.get("marketCap")),
        "peRatio": _safe_num(info.get("trailingPE") or info.get("forwardPE")),
        "eps": _safe_num(info.get("trailingEps") or info.get("forwardEps")),
        "revenue": _safe_num(info.get("totalRevenue")),
        "week52High": _safe_num(info.get("fiftyTwoWeekHigh")),
        "week52Low": _safe_num(info.get("fiftyTwoWeekLow")),
        "sector": info.get("sector") or "",
        "industry": info.get("industry") or "",
        "description": desc,
    }


def _fetch_quote_blocking(symbol: str) -> Dict[str, Any]:
    """Fetch a single quote. Tries .info first for richer fundamentals, but
    falls back to history-only computation when Yahoo rate-limits .info
    (HTTP 429 is common from residential IPs).
    """
    with _silence_stderr():
        ticker = yf.Ticker(symbol)
        # History is the cheap call — do it first so we always have SOMETHING.
        hist = None
        try:
            hist = ticker.history(period="5d", auto_adjust=False)
        except Exception:
            _logger.warning("yfinance .history failed for %s", symbol)

        # .info is where Yahoo 429s. Swallow failures silently.
        info: Dict[str, Any] = {}
        try:
            info = ticker.info or {}
        except Exception as exc:
            _logger.debug("yfinance .info unavailable for %s (%s)", symbol, exc)

    # Build a synthetic row with previous + current close — more accurate
    # than the old open/close approach.
    row: Optional[Dict[str, Any]] = None
    if hist is not None and len(hist) >= 2:
        closes = hist["Close"].dropna()
        if len(closes) >= 2:
            row = {
                "Close": float(closes.iloc[-1]),
                "PrevClose": float(closes.iloc[-2]),
            }
    elif hist is not None and len(hist) == 1:
        last = hist.iloc[-1]
        close = last.get("Close")
        if close == close:  # not NaN
            row = {"Close": float(close), "PrevClose": None}

    info.setdefault("symbol", symbol.upper())
    return _quote_from_info(info, row)


def _fmp_quote_fallback_blocking(symbol: str) -> Optional[Dict[str, Any]]:
    """When yfinance is rate-limited, try Financial Modeling Prep.

    Uses the current /stable/quote endpoint (free tier supports single-symbol
    requests; batch requires a paid plan).
    """
    if not settings.FMP_API_KEY:
        return None
    import httpx
    try:
        url = "https://financialmodelingprep.com/stable/quote"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                url,
                params={"symbol": symbol.upper(), "apikey": settings.FMP_API_KEY},
            )
        if resp.status_code != 200:
            return None
        rows = resp.json() or []
        if not rows or not isinstance(rows, list):
            return None
        r = rows[0]
    except Exception:
        _logger.exception("FMP fallback failed for %s", symbol)
        return None
    return {
        "symbol": r.get("symbol") or symbol.upper(),
        "name": r.get("name") or symbol.upper(),
        "price": _safe_num(r.get("price")),
        "change": _safe_num(r.get("change")),
        # Field renamed from `changesPercentage` in /v3 to `changePercentage` in /stable
        "changePct": _safe_num(r.get("changePercentage")),
        "volume": _safe_num(r.get("volume")),
        "marketCap": _safe_num(r.get("marketCap")),
        "peRatio": _safe_num(r.get("pe")),
        "eps": _safe_num(r.get("eps")),
        "revenue": None,
        "week52High": _safe_num(r.get("yearHigh")),
        "week52Low": _safe_num(r.get("yearLow")),
        "sector": r.get("exchange") or "",
        "industry": "",
        "description": "",
    }


def _alpha_quote_fallback_blocking(symbol: str) -> Optional[Dict[str, Any]]:
    """Last-resort fallback via Alpha Vantage GLOBAL_QUOTE (covers ETFs)."""
    if not settings.ALPHA_VANTAGE_KEY:
        return None
    import httpx
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
        price = _safe_num(q.get("05. price"))
        if price is None:
            return None
        change = _safe_num(q.get("09. change"))
        pct_str = (q.get("10. change percent") or "").rstrip("%")
        try:
            change_pct = float(pct_str) if pct_str else None
        except ValueError:
            change_pct = None
    except Exception:
        _logger.exception("Alpha Vantage fallback failed for %s", symbol)
        return None
    return {
        "symbol": symbol.upper(),
        "name": symbol.upper(),
        "price": price,
        "change": change,
        "changePct": change_pct,
        "volume": _safe_num(q.get("06. volume")),
        "marketCap": None,
        "peRatio": None,
        "eps": None,
        "revenue": None,
        "week52High": _safe_num(q.get("03. high")),
        "week52Low": _safe_num(q.get("04. low")),
        "sector": "",
        "industry": "",
        "description": "",
    }


async def get_quote(symbol: str) -> Dict[str, Any]:
    """Fetch a single quote with an FMP → yfinance → Alpha Vantage cascade.

    FMP first because Yahoo rate-limits residential IPs hard; yfinance as
    a richer-fundamentals fallback when FMP is missing; Alpha Vantage as
    a last-resort for ETFs.
    """
    symbol = symbol.upper()
    cache_key = f"quote:{symbol}"
    cached = _cache_get(cache_key, settings.QUOTE_CACHE_TTL)
    if cached is not None:
        return cached

    # 1) FMP — most reliable on free tier, no IP-based throttling.
    quote: Optional[Dict[str, Any]] = await asyncio.to_thread(
        _fmp_quote_fallback_blocking, symbol
    )

    # 2) yfinance — richer fundamentals (sector/industry/description) when FMP fails
    if not quote or quote.get("price") is None:
        yf_quote = await asyncio.to_thread(_fetch_quote_blocking, symbol)
        if yf_quote.get("price") is not None:
            quote = yf_quote
        elif quote is None:
            quote = yf_quote

    # 3) Alpha Vantage — final fallback, covers ETFs
    if not quote or quote.get("price") is None:
        av = await asyncio.to_thread(_alpha_quote_fallback_blocking, symbol)
        if av is not None and av.get("price") is not None:
            quote = av

    if quote is None:
        quote = {"symbol": symbol, "name": symbol, "price": None}

    # Short TTL on unavailable results so we retry soon.
    ttl = settings.QUOTE_CACHE_TTL if quote.get("price") is not None else 60
    _cache_put(cache_key, quote, ttl=ttl)
    return quote


async def get_multi_quote(symbols: List[str]) -> List[Dict[str, Any]]:
    symbols = [s.strip().upper() for s in symbols if s and s.strip()]
    symbols = symbols[:10]
    return await asyncio.gather(*[get_quote(s) for s in symbols])


def _fetch_history_blocking(symbol: str, period: str, interval: str) -> List[Dict[str, Any]]:
    with _silence_stderr():
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval=interval, auto_adjust=False)
    if hist is None or len(hist) == 0:
        return []
    out = []
    for ts, row in hist.iterrows():
        out.append(
            {
                "date": ts.isoformat(),
                "open": _safe_num(row.get("Open")),
                "high": _safe_num(row.get("High")),
                "low": _safe_num(row.get("Low")),
                "close": _safe_num(row.get("Close")),
                "volume": _safe_num(row.get("Volume")),
            }
        )
    return out


async def get_history(
    symbol: str, period: str = "1mo", interval: str = "1d"
) -> List[Dict[str, Any]]:
    symbol = symbol.upper()
    cache_key = f"history:{symbol}:{period}:{interval}"
    cached = _cache_get(cache_key, settings.QUOTE_CACHE_TTL)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(_fetch_history_blocking, symbol, period, interval)
    _cache_put(cache_key, data)
    return data


def _fetch_closes_7d_blocking(symbol: str) -> List[float]:
    with _silence_stderr():
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="7d", interval="1d", auto_adjust=False)
    if hist is None or len(hist) == 0:
        return []
    return [float(x) for x in hist["Close"].dropna().tolist()]


async def get_sparkline_closes(symbol: str) -> List[float]:
    cache_key = f"spark:{symbol.upper()}"
    cached = _cache_get(cache_key, settings.QUOTE_CACHE_TTL)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(_fetch_closes_7d_blocking, symbol.upper())
    _cache_put(cache_key, data)
    return data


def _batch_sector_blocking() -> List[Dict[str, Any]]:
    """One bulk yf.download for all 11 sector ETFs (both daily and YTD).

    Two HTTP calls total instead of 33. Yahoo throttles quoteSummary hard but
    download/chart is much more forgiving.
    """
    symbols = [s for s, _ in SECTOR_ETFS]
    name_by_symbol = dict(SECTOR_ETFS)

    try:
        with _silence_stderr():
            ytd = yf.download(
                tickers=symbols,
                period="ytd",
                interval="1d",
                auto_adjust=False,
                progress=False,
                threads=True,
                group_by="ticker",
            )
    except Exception:
        _logger.exception("yf.download YTD for sector heatmap failed")
        ytd = None

    rows: List[Dict[str, Any]] = []
    for sym in symbols:
        change_pct: Optional[float] = None
        ytd_change: Optional[float] = None
        try:
            if ytd is not None and sym in ytd.columns.get_level_values(0):
                closes = ytd[sym]["Close"].dropna()
                if len(closes) >= 2:
                    prev, last = float(closes.iloc[-2]), float(closes.iloc[-1])
                    if prev:
                        change_pct = ((last - prev) / prev) * 100
                    first_ytd = float(closes.iloc[0])
                    if first_ytd:
                        ytd_change = ((last - first_ytd) / first_ytd) * 100
        except Exception:
            _logger.exception("Could not compute sector row for %s", sym)

        rows.append(
            {
                "symbol": sym,
                "sectorName": name_by_symbol[sym],
                "changePct": change_pct,
                "ytdChange": ytd_change,
                "marketCapWeight": None,
                "topMovers": [],
            }
        )
    return rows


def _alpha_sector_fallback_blocking() -> List[Dict[str, Any]]:
    """Alpha Vantage GLOBAL_QUOTE covers ETFs (unlike FMP free tier).

    Free tier is rate-limited (~5 req/min, ~25 req/day depending on plan).
    We attempt all 11 sequentially and take whatever succeeds — partial data
    is better than none, and the 15-minute cache means we won't re-hit the
    limit on every page load.
    """
    if not settings.ALPHA_VANTAGE_KEY:
        return []
    import httpx
    symbols = [s for s, _ in SECTOR_ETFS]
    name_by_symbol = dict(SECTOR_ETFS)
    rows: List[Dict[str, Any]] = []
    try:
        with httpx.Client(timeout=15.0) as client:
            for sym in symbols:
                change_pct: Optional[float] = None
                try:
                    resp = client.get(
                        "https://www.alphavantage.co/query",
                        params={
                            "function": "GLOBAL_QUOTE",
                            "symbol": sym,
                            "apikey": settings.ALPHA_VANTAGE_KEY,
                        },
                    )
                    if resp.status_code == 200:
                        payload = resp.json() or {}
                        quote = payload.get("Global Quote") or {}
                        pct_str = quote.get("10. change percent", "").rstrip("%")
                        try:
                            change_pct = float(pct_str) if pct_str else None
                        except ValueError:
                            change_pct = None
                except Exception:
                    _logger.debug("Alpha Vantage fetch failed for %s", sym)
                rows.append(
                    {
                        "symbol": sym,
                        "sectorName": name_by_symbol[sym],
                        "changePct": change_pct,
                        "ytdChange": None,
                        "marketCapWeight": None,
                        "topMovers": [],
                    }
                )
    except Exception:
        _logger.exception("Alpha Vantage sector fallback failed")
    return rows


def _fmp_sector_fallback_blocking() -> List[Dict[str, Any]]:
    """11 single-symbol FMP quote calls.

    Free FMP tier doesn't cover ETFs (blocked as "special endpoint"), so this
    will return no data — kept as a stub for paid subscribers. The real ETF
    fallback is Alpha Vantage above.
    """
    if not settings.FMP_API_KEY:
        return []
    import httpx
    symbols = [s for s, _ in SECTOR_ETFS]
    name_by_symbol = dict(SECTOR_ETFS)
    rows: List[Dict[str, Any]] = []
    try:
        with httpx.Client(timeout=10.0) as client:
            for sym in symbols:
                changePct: Optional[float] = None
                market_cap: Optional[float] = None
                try:
                    resp = client.get(
                        "https://financialmodelingprep.com/stable/quote",
                        params={"symbol": sym, "apikey": settings.FMP_API_KEY},
                    )
                    if resp.status_code == 200:
                        data = resp.json() or []
                        if isinstance(data, list) and data:
                            changePct = _safe_num(data[0].get("changePercentage"))
                            market_cap = _safe_num(data[0].get("marketCap"))
                except Exception:
                    _logger.debug("FMP fetch failed for %s", sym)
                rows.append(
                    {
                        "symbol": sym,
                        "sectorName": name_by_symbol[sym],
                        "changePct": changePct,
                        "ytdChange": None,
                        "marketCapWeight": market_cap,
                        "topMovers": [],
                    }
                )
    except Exception:
        _logger.exception("FMP sector fallback failed")
    return rows


# FMP's "sector-performance-snapshot" endpoint groups returns by sector
# name (not ETF ticker), so we map those back to the 11 sector ETFs
# the UI expects.
_SECTOR_NAME_TO_ETF: Dict[str, Tuple[str, str]] = {
    "Technology": ("XLK", "Technology"),
    "Financial Services": ("XLF", "Financials"),
    "Healthcare": ("XLV", "Healthcare"),
    "Energy": ("XLE", "Energy"),
    "Industrials": ("XLI", "Industrials"),
    "Consumer Cyclical": ("XLY", "Consumer Discretionary"),
    "Consumer Defensive": ("XLP", "Consumer Staples"),
    "Utilities": ("XLU", "Utilities"),
    "Basic Materials": ("XLB", "Materials"),
    "Real Estate": ("XLRE", "Real Estate"),
    "Communication Services": ("XLC", "Communication Services"),
}


def _fmp_sector_snapshot_blocking() -> List[Dict[str, Any]]:
    """FMP /stable/sector-performance-snapshot — works on free tier.

    Returns per-sector average change grouped by sector name across multiple
    exchanges; we aggregate to one number per sector and map back to the ETF
    tickers the heatmap expects.
    """
    if not settings.FMP_API_KEY:
        return []
    import httpx
    from datetime import datetime, timedelta

    # Today may not have data on weekends/holidays — walk back up to 5 days.
    today = datetime.utcnow().date()
    data: List[Dict[str, Any]] = []
    try:
        with httpx.Client(timeout=12.0) as client:
            for offset in range(0, 6):
                d = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
                resp = client.get(
                    "https://financialmodelingprep.com/stable/sector-performance-snapshot",
                    params={"date": d, "apikey": settings.FMP_API_KEY},
                )
                if resp.status_code == 200:
                    payload = resp.json() or []
                    if isinstance(payload, list) and payload:
                        data = payload
                        break
    except Exception:
        _logger.exception("FMP sector snapshot failed")
        return []

    # Aggregate: some sectors appear per exchange (NASDAQ/NYSE/AMEX) — average them.
    by_sector: Dict[str, List[float]] = {}
    for row in data:
        sector = row.get("sector")
        chg = _safe_num(row.get("averageChange"))
        if sector and chg is not None:
            by_sector.setdefault(sector, []).append(chg)
    sector_avg: Dict[str, float] = {
        k: sum(v) / len(v) for k, v in by_sector.items() if v
    }

    rows: List[Dict[str, Any]] = []
    for sector_name_fmp, (etf_symbol, display_name) in _SECTOR_NAME_TO_ETF.items():
        chg = sector_avg.get(sector_name_fmp)
        rows.append(
            {
                "symbol": etf_symbol,
                "sectorName": display_name,
                "changePct": chg,
                "ytdChange": None,
                "marketCapWeight": None,
                "topMovers": [],
            }
        )
    return rows


async def get_sector_heatmap() -> List[Dict[str, Any]]:
    """Sector ETF heatmap. FMP batch → yfinance batch → Alpha Vantage."""
    cache_key = "sector-heatmap"
    cached = _cache_get(cache_key, settings.SECTOR_CACHE_TTL)
    if cached is not None:
        return cached

    # 1) FMP /stable/sector-performance-snapshot — works on free tier
    rows = await asyncio.to_thread(_fmp_sector_snapshot_blocking)
    has_any_data = any(r.get("changePct") is not None for r in rows)

    # 2) Alpha Vantage — sequential ETF fallback (rate-limited)
    if not has_any_data:
        fallback = await asyncio.to_thread(_alpha_sector_fallback_blocking)
        if any(r.get("changePct") is not None for r in fallback):
            rows = fallback
            has_any_data = True

    # 3) yfinance batch — last resort, noisy when rate-limited
    if not has_any_data:
        rows = await asyncio.to_thread(_batch_sector_blocking)
        has_any_data = any(r.get("changePct") is not None for r in rows)

    ttl = settings.SECTOR_CACHE_TTL if has_any_data else 60
    _cache_put(cache_key, rows, ttl=ttl)
    return rows


def _batch_movers_blocking(universe: List[str]) -> List[Dict[str, Any]]:
    with _silence_stderr():
        data = yf.download(
            tickers=universe,
            period="2d",
            interval="1d",
            auto_adjust=False,
            progress=False,
            threads=True,
            group_by="ticker",
        )
    rows: List[Dict[str, Any]] = []
    for symbol in universe:
        try:
            sub = data[symbol] if symbol in data.columns.levels[0] else None
        except Exception:
            sub = None
        if sub is None or len(sub) < 2:
            continue
        closes = sub["Close"].dropna()
        if len(closes) < 2:
            continue
        prev, last = float(closes.iloc[-2]), float(closes.iloc[-1])
        if prev == 0:
            continue
        rows.append(
            {
                "symbol": symbol,
                "price": last,
                "change": last - prev,
                "changePct": ((last - prev) / prev) * 100,
            }
        )
    return rows


def _fmp_movers_blocking() -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """FMP /stable/biggest-gainers + /stable/biggest-losers — free tier works.

    Replaces the old /api/v3/stock_market/* endpoints which are now 403 Legacy.
    """
    if not settings.FMP_API_KEY:
        return None
    import httpx

    def _normalize(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in raw[:5]:
            symbol = item.get("symbol") or item.get("ticker")
            if not symbol:
                continue
            out.append(
                {
                    "symbol": symbol,
                    "name": item.get("name") or item.get("companyName") or symbol,
                    "price": _safe_num(item.get("price")),
                    "change": _safe_num(item.get("change")),
                    "changePct": _safe_num(
                        item.get("changesPercentage") or item.get("changePercentage")
                    ),
                }
            )
        return out

    try:
        with httpx.Client(timeout=12.0) as client:
            g = client.get(
                "https://financialmodelingprep.com/stable/biggest-gainers",
                params={"apikey": settings.FMP_API_KEY},
            )
            l = client.get(
                "https://financialmodelingprep.com/stable/biggest-losers",
                params={"apikey": settings.FMP_API_KEY},
            )
    except Exception:
        _logger.exception("FMP movers request failed")
        return None

    gainers: List[Dict[str, Any]] = []
    losers: List[Dict[str, Any]] = []
    if g.status_code == 200:
        try:
            gainers = _normalize(g.json() or [])
        except Exception:
            _logger.exception("FMP gainers parse failed")
    if l.status_code == 200:
        try:
            losers = _normalize(l.json() or [])
        except Exception:
            _logger.exception("FMP losers parse failed")

    if not gainers and not losers:
        return None
    return {"gainers": gainers, "losers": losers}


async def get_market_movers() -> Dict[str, List[Dict[str, Any]]]:
    cache_key = "movers"
    cached = _cache_get(cache_key, settings.MOVERS_CACHE_TTL)
    if cached is not None:
        return cached

    # 1) FMP dedicated endpoints — fastest path
    fmp_result = await asyncio.to_thread(_fmp_movers_blocking)
    if fmp_result is not None:
        _cache_put(cache_key, fmp_result, ttl=settings.MOVERS_CACHE_TTL)
        return fmp_result

    # 2) yfinance batch over a 50-name universe
    rows = await asyncio.to_thread(_batch_movers_blocking, MOVERS_UNIVERSE)
    rows.sort(key=lambda r: r["changePct"], reverse=True)
    gainers = rows[:5]
    losers = list(reversed(rows[-5:])) if len(rows) >= 5 else list(reversed(rows))
    result = {"gainers": gainers, "losers": losers}
    ttl = settings.MOVERS_CACHE_TTL if (gainers or losers) else 60
    _cache_put(cache_key, result, ttl=ttl)
    return result


def search_symbols(query: str) -> List[Dict[str, str]]:
    if not query:
        return []
    q = query.strip().upper()
    matches: List[Dict[str, str]] = []
    for entry in SEARCH_CATALOG:
        if q in entry["symbol"].upper() or q in entry["name"].upper():
            matches.append(entry)
            if len(matches) >= 10:
                break
    return matches


_KNOWN_SYMBOL_WHITELIST = {
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "AMD",
    "INTC", "ORCL", "CRM", "NFLX", "JPM", "BAC", "GS", "WFC",
    "V", "MA", "PYPL", "COST", "WMT", "HD", "NKE", "DIS", "BRK-B",
    "SPY", "QQQ", "VOO", "IWM", "XLK", "XLF", "XLV", "XLE", "XLI", "XLY",
    "XLP", "XLU", "XLB", "XLRE", "XLC", "AVGO", "LLY", "UNH", "XOM", "CVX",
    "KO", "PEP", "MCD", "BA", "ABBV", "MRK", "JNJ", "PG", "TMO", "ABT",
    "T", "IBM", "QCOM", "TXN", "ADBE", "CSCO", "ACN", "UBER", "GE", "DHR",
}


async def symbol_exists(symbol: str) -> bool:
    """Check that a ticker resolves to real data.

    Tries FMP → yfinance → known-symbol whitelist. The whitelist ensures we
    don't block the user when upstream APIs are all rate-limited.
    """
    sym = symbol.upper()
    quote = await get_quote(sym)
    if quote.get("price") is not None:
        return True
    return sym in _KNOWN_SYMBOL_WHITELIST
