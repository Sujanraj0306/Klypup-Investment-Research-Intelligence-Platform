"""Firebase Admin SDK initialization.

Initializes lazily on first use. Supports two credential sources:
  - FIREBASE_CREDENTIALS_PATH  → path to a service-account JSON file
  - FIREBASE_CREDENTIALS_JSON  → inline JSON string (useful for Cloud Run / Secret Manager)

Falls back to application default credentials if neither is set.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials

from .config import settings

_logger = logging.getLogger(__name__)
_app: Optional[firebase_admin.App] = None


def get_firebase_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app

    if firebase_admin._apps:
        _app = firebase_admin.get_app()
        return _app

    cred: Optional[credentials.Base] = None
    if settings.FIREBASE_CREDENTIALS_JSON:
        try:
            cred = credentials.Certificate(
                json.loads(settings.FIREBASE_CREDENTIALS_JSON),
            )
        except json.JSONDecodeError as exc:
            _logger.error("Invalid FIREBASE_CREDENTIALS_JSON: %s", exc)
            raise
    elif settings.FIREBASE_CREDENTIALS_PATH:
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)

    options = (
        {"projectId": settings.FIREBASE_PROJECT_ID}
        if settings.FIREBASE_PROJECT_ID
        else None
    )

    _app = firebase_admin.initialize_app(cred, options=options)
    return _app
