"""Firestore client accessor.

Lazily initializes Firebase Admin and returns a Firestore client.
"""

from __future__ import annotations

from firebase_admin import firestore

from .firebase_admin import get_firebase_app


def get_firestore():
    get_firebase_app()
    return firestore.client()


def watchlist_collection(org_id: str):
    return get_firestore().collection("orgs").document(org_id).collection("watchlist")


def reports_collection(org_id: str):
    return get_firestore().collection("orgs").document(org_id).collection("reports")
