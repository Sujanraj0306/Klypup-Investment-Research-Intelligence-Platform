"""Supabase service-role client.

Service-role key bypasses RLS and must NEVER be exposed to the browser.
Returns None if Supabase isn't configured so callers can degrade gracefully.
"""

from __future__ import annotations

from typing import Optional

from supabase import Client, create_client

from .config import settings

_client: Optional[Client] = None


def get_supabase() -> Optional[Client]:
    global _client
    if _client is not None:
        return _client
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        return None
    _client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY,
    )
    return _client
