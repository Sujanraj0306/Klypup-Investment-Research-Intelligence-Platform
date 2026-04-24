from typing import Optional

from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    uid: str
    email: Optional[str] = None
    email_verified: bool = False
    display_name: Optional[str] = None
    org_id: Optional[str] = None
