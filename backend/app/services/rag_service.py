"""ChromaDB-backed RAG for SEC filings + earnings transcripts.

Notes
-----
* ChromaDB uses persistent storage at `settings.CHROMA_PATH`. The directory
  is created on demand.
* Embeddings come from Gemini `embedding-001` via `core.embeddings.embed_text`.
  If GEMINI_API_KEY isn't set, queries still run — they fall back to
  ChromaDB's own text-based query (`query_texts=...`) which uses its
  default all-MiniLM sentence-transformers embedder.
* All ChromaDB calls are blocking, so we wrap them in asyncio.to_thread.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from ..core import embeddings as embeddings_core
from ..core.config import settings

_logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self) -> None:
        self._client: Optional[chromadb.api.ClientAPI] = None
        self._collection = None

    def _ensure_collection(self):
        if self._collection is not None:
            return self._collection
        # anonymized_telemetry=False silences the "Failed to send telemetry
        # event ..." warnings caused by a version mismatch in chromadb's
        # internal posthog.capture() call signature.
        self._client = chromadb.PersistentClient(
            path=settings.CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        return self._collection

    async def query(
        self,
        query_text: str,
        ticker_filter: Optional[List[str]] = None,
        n_results: int = 5,
    ) -> List[Dict[str, Any]]:
        if not query_text:
            return []

        def _run() -> List[Dict[str, Any]]:
            col = self._ensure_collection()
            where = (
                {"ticker": {"$in": [t.upper() for t in ticker_filter]}}
                if ticker_filter
                else None
            )
            try:
                return col.query  # probe attribute for type checkers
            except Exception:
                return []

        # Decide embedding path up front so we don't try Gemini on every call
        # when it's not configured.
        query_embedding = await embeddings_core.embed_text(
            query_text, task_type="retrieval_query"
        )

        def _execute() -> Dict[str, Any]:
            col = self._ensure_collection()
            where = (
                {"ticker": {"$in": [t.upper() for t in ticker_filter]}}
                if ticker_filter
                else None
            )
            if query_embedding is not None:
                return col.query(
                    query_embeddings=[query_embedding],
                    n_results=n_results,
                    where=where,
                    include=["documents", "metadatas", "distances"],
                )
            # Fallback: let Chroma embed with its default model.
            return col.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where,
                include=["documents", "metadatas", "distances"],
            )

        try:
            raw = await asyncio.to_thread(_execute)
        except Exception:
            _logger.exception("ChromaDB query failed")
            return []

        docs = (raw.get("documents") or [[]])[0]
        metas = (raw.get("metadatas") or [[]])[0]
        dists = (raw.get("distances") or [[]])[0]

        hits: List[Dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, dists):
            meta = meta or {}
            hits.append(
                {
                    "text": doc,
                    "metadata": meta,
                    "relevance_score": max(0.0, 1.0 - float(dist)),
                    "source": _source_label(meta),
                    "source_url": meta.get("source_url"),
                }
            )
        return hits

    def add_chunks(
        self,
        ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings_list: Optional[List[List[float]]] = None,
    ) -> None:
        """Synchronous bulk insert — called from the ingestion script."""
        col = self._ensure_collection()
        if embeddings_list is not None:
            col.upsert(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
                embeddings=embeddings_list,
            )
        else:
            col.upsert(ids=ids, documents=documents, metadatas=metadatas)

    def stats(self) -> Dict[str, Any]:
        try:
            col = self._ensure_collection()
            return {
                "total_chunks": col.count(),
                "collection": settings.CHROMA_COLLECTION,
                "path": settings.CHROMA_PATH,
            }
        except Exception as exc:
            return {"error": str(exc)}


def _source_label(meta: Dict[str, Any]) -> str:
    ticker = meta.get("ticker", "?")
    filing_type = meta.get("filing_type", "doc")
    period = meta.get("period") or meta.get("date") or ""
    section = meta.get("section_name") or ""
    parts = [f"SEC {filing_type} — {ticker}", period, section]
    return ", ".join(p for p in parts if p)


rag_service = RAGService()
