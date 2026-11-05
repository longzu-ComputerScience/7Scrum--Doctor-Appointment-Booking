"""Read-only admin doctor directory using the existing schema.

Grant access through ADMIN_USER_IDS on the backend environment only.
Never trust role/user metadata or expose service-role keys to the frontend.
No admin review writes are offered until a durable approval model is available.
"""
import os

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.service import _authenticated_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])
bearer = HTTPBearer(auto_error=False)


def admin_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None or not credentials.credentials.strip():
        raise HTTPException(401, "Administrator sign-in required")
    client, user_id, _ = _authenticated_user(credentials.credentials.strip())
    allowed = {
        value.strip().lower()
        for value in os.getenv("ADMIN_USER_IDS", "").split(",")
        if value.strip()
    }
    # UUIDs from auth.get_user are immutable, unlike client metadata or email claims.
    if user_id.lower() not in allowed:
        raise HTTPException(403, "Administrator access denied")
    return client, user_id


@router.get("/doctors")
def list_admin_doctors(response: Response, ctx=Depends(admin_context)):
    """Authenticated admins can inspect existing doctor profiles; this endpoint never mutates data."""
    response.headers["Cache-Control"] = "no-store"
    client, _ = ctx
    try:
        rows = (
            client.table("doctors")
            .select("id,name,specialty,active,bio,address,district,certificates")
            .order("name").limit(500).execute().data
        )
    except Exception as exc:
        raise HTTPException(503, "Doctor directory unavailable") from exc

    return {"doctors": [{
        "id": str(row["id"]),
        "name": row["name"],
        "specialty": row["specialty"],
        "active": bool(row["active"]),
        "bio": row.get("bio") or "",
        "address": row.get("address") or "",
        "district": row.get("district") or "",
        "certificates": row.get("certificates") or [],
    } for row in rows]}
