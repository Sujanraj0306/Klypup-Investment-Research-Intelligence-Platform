"""Ingest SEC 10-K / 10-Q filings into ChromaDB for the research-agent RAG.

Usage
-----
    cd backend
    .venv/bin/python -m scripts.ingest_filings --tickers AAPL,NVDA --limit 2

What it does
------------
1. Resolves each ticker to a CIK via SEC's ticker mapping file.
2. Lists recent 10-K / 10-Q filings from EDGAR's submissions API.
3. Downloads the primary filing document, strips HTML with BeautifulSoup.
4. Chunks text with tiktoken (cl100k_base), 600 tokens per chunk, 100 overlap.
5. Embeds chunks with Gemini `embedding-001` (skips if GEMINI_API_KEY unset —
   Chroma will default-embed with its sentence-transformers model).
6. Upserts into the `sec_filings` collection with ticker/filing-type metadata.

SEC rate-limit rules (be polite): max 10 req/s and a descriptive User-Agent
with a real contact email. Set `SEC_USER_AGENT` in your .env.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
import time
from typing import Any, Dict, Iterable, List, Optional

import httpx
import tiktoken
from bs4 import BeautifulSoup

# Ensure backend root is on the path when invoked as a script.
sys.path.insert(0, str(__file__).rsplit("/backend/", 1)[0] + "/backend")

from app.core import embeddings as embeddings_core  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.services.rag_service import rag_service  # noqa: E402


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
_logger = logging.getLogger("ingest")

DEFAULT_TICKERS = [
    "AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "AMD", "INTC", "JPM",
]

SEC_HEADERS = {
    "User-Agent": settings.SEC_USER_AGENT,
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
}

_tokenizer = tiktoken.get_encoding("cl100k_base")


def chunk_text(text: str, max_tokens: int = 600, overlap: int = 100) -> List[str]:
    """Sliding-window chunk by cl100k tokens."""
    if not text.strip():
        return []
    tokens = _tokenizer.encode(text)
    if not tokens:
        return []
    stride = max(1, max_tokens - overlap)
    chunks: List[str] = []
    for start in range(0, len(tokens), stride):
        window = tokens[start : start + max_tokens]
        if not window:
            break
        chunks.append(_tokenizer.decode(window))
        if start + max_tokens >= len(tokens):
            break
    return chunks


async def _get_json(client: httpx.AsyncClient, url: str) -> Dict[str, Any]:
    resp = await client.get(url, headers=SEC_HEADERS, timeout=20.0)
    resp.raise_for_status()
    return resp.json()


async def _get_text(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, headers=SEC_HEADERS, timeout=30.0)
    resp.raise_for_status()
    return resp.text


async def load_ticker_to_cik(client: httpx.AsyncClient) -> Dict[str, str]:
    """SEC publishes a canonical ticker→CIK map."""
    data = await _get_json(client, "https://www.sec.gov/files/company_tickers.json")
    mapping: Dict[str, str] = {}
    for row in data.values():
        mapping[row["ticker"].upper()] = str(row["cik_str"]).zfill(10)
    return mapping


async def list_filings(
    client: httpx.AsyncClient,
    cik: str,
    form_types: Iterable[str],
    limit: int,
) -> List[Dict[str, Any]]:
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    data = await _get_json(client, url)
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])
    wanted = {f.upper() for f in form_types}
    results: List[Dict[str, Any]] = []
    for form, acc, date, doc in zip(forms, accessions, dates, primary_docs):
        if form.upper() not in wanted:
            continue
        acc_clean = acc.replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{doc}"
        results.append(
            {
                "form": form,
                "accession": acc,
                "filing_date": date,
                "primary_document": doc,
                "url": url,
            }
        )
        if len(results) >= limit:
            break
    return results


def clean_filing_html(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ")
    # Collapse repeated whitespace and drop non-printables.
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def _throttled(coro_factory, throttle_s: float = 0.12):
    """Ensure we never fire more than ~8 SEC requests/sec."""
    result = await coro_factory()
    await asyncio.sleep(throttle_s)
    return result


async def ingest_one(
    client: httpx.AsyncClient,
    ticker: str,
    cik: str,
    filing: Dict[str, Any],
) -> int:
    _logger.info("  %s %s (%s) → fetching", ticker, filing["form"], filing["filing_date"])
    html = await _throttled(lambda: _get_text(client, filing["url"]))
    text = clean_filing_html(html)
    if not text:
        _logger.warning("  %s %s: empty body, skipping", ticker, filing["form"])
        return 0
    chunks = chunk_text(text)
    _logger.info("  %s %s: chunked into %d pieces", ticker, filing["form"], len(chunks))
    if not chunks:
        return 0

    # Embed in small batches so we don't blast Gemini
    embeddings: Optional[List[List[float]]] = None
    if settings.GEMINI_API_KEY:
        embeddings = []
        for i, chunk in enumerate(chunks, 1):
            emb = await embeddings_core.embed_text(chunk, task_type="retrieval_document")
            embeddings.append(emb or [])
            if i % 20 == 0:
                _logger.info("    embedded %d/%d", i, len(chunks))
        # If any embedding failed, drop the whole list so we fall back to
        # Chroma's default embedder rather than mixing dimensions.
        if not all(embeddings):
            _logger.warning(
                "  some embeddings failed — falling back to Chroma default embedder"
            )
            embeddings = None

    ids = [f"{ticker}-{filing['accession']}-{idx}" for idx in range(len(chunks))]
    metadatas = [
        {
            "ticker": ticker,
            "filing_type": filing["form"],
            "period": filing["filing_date"],
            "accession": filing["accession"],
            "chunk_index": idx,
            "source_url": filing["url"],
        }
        for idx in range(len(chunks))
    ]

    # rag_service is sync; run in a thread so we don't block the loop.
    await asyncio.to_thread(
        rag_service.add_chunks,
        ids=ids,
        documents=chunks,
        metadatas=metadatas,
        embeddings_list=embeddings,
    )
    return len(chunks)


async def ingest(tickers: List[str], forms: List[str], limit: int) -> None:
    async with httpx.AsyncClient() as client:
        ticker_map = await load_ticker_to_cik(client)
        total = 0
        for ticker in tickers:
            ticker = ticker.upper()
            cik = ticker_map.get(ticker)
            if not cik:
                _logger.warning("%s: no CIK found, skipping", ticker)
                continue
            _logger.info("Processing %s (CIK %s)", ticker, cik)
            try:
                filings = await list_filings(client, cik, forms, limit)
            except Exception:
                _logger.exception("%s: failed to list filings", ticker)
                continue
            if not filings:
                _logger.info("  %s: no filings found for %s", ticker, forms)
                continue
            for filing in filings:
                try:
                    added = await ingest_one(client, ticker, cik, filing)
                    total += added
                except Exception:
                    _logger.exception(
                        "  %s %s: ingest failed", ticker, filing["form"]
                    )
    stats = rag_service.stats()
    _logger.info("Done. Added %d chunks. Collection now: %s", total, stats)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Ingest SEC filings into ChromaDB")
    p.add_argument(
        "--tickers",
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated tickers",
    )
    p.add_argument(
        "--forms",
        default="10-K,10-Q",
        help="Comma-separated form types",
    )
    p.add_argument("--limit", type=int, default=1, help="Filings per ticker/form-list")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    started = time.time()
    asyncio.run(
        ingest(
            tickers=[t.strip() for t in args.tickers.split(",") if t.strip()],
            forms=[f.strip() for f in args.forms.split(",") if f.strip()],
            limit=args.limit,
        )
    )
    _logger.info("Elapsed %.1fs", time.time() - started)
