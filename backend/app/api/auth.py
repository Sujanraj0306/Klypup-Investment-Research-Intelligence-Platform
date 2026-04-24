"""Firebase ID token verification + org resolution dependencies.

- `verify_firebase_token` → returns AuthenticatedUser (org_id may be None).
- `CurrentUser` alias = Depends(verify_firebase_token).
- `get_current_org` → resolves the user's default org from Firestore users/{uid}.
- `CurrentOrgUser` alias = Depends(get_current_org). Use it in endpoints that
  read/write org-scoped data (watchlist, reports).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth as firebase_auth

from ..core.firebase_admin import get_firebase_app
from ..core.firestore_client import get_firestore
from ..models.user import AuthenticatedUser

_logger = logging.getLogger(__name__)


async def verify_firebase_token(
    authorization: Annotated[str, Header()],
) -> AuthenticatedUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )

    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
    except firebase_auth.InvalidIdTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token",
        ) from exc
    except firebase_auth.ExpiredIdTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expired Firebase ID token",
        ) from exc
    except Exception as exc:
        _logger.exception("Firebase token verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify token",
        ) from exc

    return AuthenticatedUser(
        uid=decoded["uid"],
        email=decoded.get("email"),
        email_verified=decoded.get("email_verified", False),
        display_name=decoded.get("name"),
        org_id=decoded.get("org_id") or decoded.get("defaultOrg"),
    )


CurrentUser = Annotated[AuthenticatedUser, Depends(verify_firebase_token)]


async def _load_default_org(uid: str) -> str | None:
    db = get_firestore()
    snap = await asyncio.to_thread(lambda: db.collection("users").document(uid).get())
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    return data.get("defaultOrg")


async def get_current_org(
    user: Annotated[AuthenticatedUser, Depends(verify_firebase_token)],
) -> AuthenticatedUser:
    if user.org_id:
        return user
    try:
        org_id = await _load_default_org(user.uid)
    except Exception as exc:
        _logger.exception("Failed to resolve default org for %s", user.uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to resolve user org",
        ) from exc
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no associated organization",
        )
    user.org_id = org_id
    return user


CurrentOrgUser = Annotated[AuthenticatedUser, Depends(get_current_org)]
