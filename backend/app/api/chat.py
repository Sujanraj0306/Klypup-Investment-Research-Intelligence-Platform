"""Chat follow-up on a completed research report.

Streams chunked responses as SSE frames matching the same event contract
as /api/research/stream: `event: chunk` / `event: done` / `event: error`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..core.config import settings
from .auth import CurrentOrgUser

_logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    report_context: Dict[str, Any]
    history: List[ChatMessage] = Field(default_factory=list)


def _build_system_prompt(report_context: Dict[str, Any]) -> str:
    companies: List[str] = report_context.get("companies") or []
    chat_ctx: Dict[str, Any] = report_context.get("chat_context") or {}
    sections: Dict[str, Any] = report_context.get("sections") or {}
    synthesis: Dict[str, Any] = sections.get("synthesis") or {}
    market_data: Dict[str, Any] = (sections.get("market") or {}).get("data") or {}

    market_lines: List[str] = []
    for sym, q in market_data.items():
        if not isinstance(q, dict):
            continue
        price = q.get("price")
        change_pct = q.get("change_pct")
        pe = q.get("pe_ratio") or q.get("pe_ratio_ttm")
        mcap = q.get("market_cap")
        mcap_str = (
            f"${mcap / 1e9:.1f}B" if isinstance(mcap, (int, float)) and mcap else "N/A"
        )
        price_str = f"${price:.2f}" if isinstance(price, (int, float)) else "N/A"
        chg_str = (
            f"{change_pct:+.2f}%" if isinstance(change_pct, (int, float)) else "N/A"
        )
        pe_str = f"{pe:.1f}" if isinstance(pe, (int, float)) else "N/A"
        market_lines.append(
            f"- {sym}: price {price_str}, change {chg_str}, P/E {pe_str}, market cap {mcap_str}"
        )

    findings = synthesis.get("key_findings") or []
    findings_block = "\n".join(f"  • {f}" for f in findings[:8])
    summary = chat_ctx.get("summary_for_followup") or (synthesis.get("summary") or "")[:1200]

    return f"""You are a financial research assistant at Klypup. You have just produced a research report; the user is now asking follow-up questions about it.

RESEARCH CONTEXT
Companies: {", ".join(companies) if companies else "n/a"}

Research summary:
{summary}

Key market data:
{chr(10).join(market_lines) if market_lines else "  (no market data available)"}

Key findings from the report:
{findings_block if findings_block else "  (no findings)"}

HOW TO ANSWER
- Ground every answer in the data above. Cite specific numbers when you can.
- When the user asks "which is the better buy" or "when to buy", give a direct opinion with 2-3 concrete reasons from the data. You are a research assistant — it's OK to give a recommendation.
- Keep answers tight: 3-6 sentences for simple questions; longer only when the question asks for deeper analysis.
- Use markdown lightly: **bold** for key terms, short bullet lists when listing 3+ items. Do not use headings.
- If the data doesn't support an answer, say so and describe what would be needed — don't fabricate.
- Never refuse with a generic "I cannot provide financial advice" line; the user already knows the research is informational.
"""


async def _stream_chat(
    request: ChatRequest,
) -> AsyncIterator[Dict[str, str]]:
    if not settings.GEMINI_API_KEY:
        yield {
            "event": "error",
            "data": json.dumps({"message": "GEMINI_API_KEY is not configured"}),
        }
        return

    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)

    system_prompt = _build_system_prompt(request.report_context)

    # Convert history to Gemini's content format
    conversation: List[Dict[str, Any]] = []
    for msg in request.history[-10:]:
        role = "user" if msg.role == "user" else "model"
        conversation.append({"role": role, "parts": [{"text": msg.content}]})
    conversation.append({"role": "user", "parts": [{"text": request.message}]})

    try:
        model = genai.GenerativeModel(
            settings.GEMINI_MODEL, system_instruction=system_prompt
        )
        response = await asyncio.to_thread(model.generate_content, conversation)
        full_text = getattr(response, "text", "") or ""
    except Exception as exc:
        _logger.exception("Chat generation failed")
        yield {"event": "error", "data": json.dumps({"message": str(exc)})}
        return

    if not full_text.strip():
        yield {
            "event": "error",
            "data": json.dumps(
                {"message": "Empty response from model — try rephrasing."}
            ),
        }
        return

    # Typewriter-style chunking for UX
    chunk_size = 18
    for i in range(0, len(full_text), chunk_size):
        chunk = full_text[i : i + chunk_size]
        yield {"event": "chunk", "data": json.dumps({"text": chunk})}
        await asyncio.sleep(0.015)

    yield {"event": "done", "data": json.dumps({"length": len(full_text)})}


@router.post("/followup")
async def chat_followup(request: ChatRequest, user: CurrentOrgUser):
    _ = user
    if not request.report_context:
        raise HTTPException(
            status_code=400, detail="report_context is required for follow-up chat"
        )
    return EventSourceResponse(
        _stream_chat(request), media_type="text/event-stream"
    )
