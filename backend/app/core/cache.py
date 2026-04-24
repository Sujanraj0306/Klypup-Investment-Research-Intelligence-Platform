"""Tiny TTL cache used by market endpoints and news/social tools.

Single-process only — good enough for a single Cloud Run instance. Swap for
Redis or Memorystore when we horizontally scale.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Optional


class TTLCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            hit = self._data.get(key)
            if hit is None:
                return None
            value, expires_at = hit
            if time.time() >= expires_at:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        with self._lock:
            self._data[key] = (value, time.time() + ttl)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._data)


cache = TTLCache()
