from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    query: str = Field(..., min_length=1)
    sections: dict = Field(default_factory=dict)


class ReportUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    sections: Optional[dict] = None


class Report(BaseModel):
    id: str
    org_id: str
    author_uid: str
    title: str
    query: str
    sections: dict
    created_at: datetime
    updated_at: Optional[datetime] = None


class WatchlistItemCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=10)


class WatchlistItem(BaseModel):
    id: str
    org_id: str
    ticker: str
    added_at: datetime
    added_by_uid: str
