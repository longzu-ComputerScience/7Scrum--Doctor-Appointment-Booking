"""Administrator-only application review endpoints.

This is a separate intake queue; existing invitation-based doctor registration remains unchanged.
"""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.service import _authenticated_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])
bearer = HTTPBearer(auto_error=False)


def admin_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials or not credentials.credentials:
        raise HTTPException(401, "Administrator sign-in required")
    client, user_id, _ = _authenticated_user(credentials.credentials)
    try:
        rows = client.table("admin_accounts").select("user_id").eq("user_id", user_id).limit(1).execute().data
    except Exception as exc:
        raise HTTPException(503, "Admin access verification unavailable") from exc
    if not rows:
        raise HTTPException(403, "Administrator access denied")
    return client, user_id


class ReviewInput(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str | None = Field(default=None, max_length=1000)


@router.get("/doctor-applications")
def list_applications(response: Response, ctx=Depends(admin_context)):
    response.headers["Cache-Control"] = "no-store"
    client, _ = ctx
    try:
        records = client.table("doctor_applications").select(
            "id,full_name,email,specialty,license_number,hospital,experience_years,"
            "submitted_at,status,bio,documents,review_note"
        ).order("submitted_at", desc=True).limit(200).execute().data
    except Exception as exc:
        raise HTTPException(503, "Applications unavailable (apply migration 006)") from exc
    return {"applications": [{
        "id": str(r["id"]), "fullName": r["full_name"], "email": r["email"],
        "specialty": r["specialty"], "licenseNumber": r["license_number"],
        "hospital": r["hospital"], "experienceYears": r["experience_years"],
        "submittedAt": str(r["submitted_at"])[:10], "status": r["status"],
        "bio": r["bio"], "documents": r["documents"], "reviewNote": r["review_note"]
    } for r in records]}


@router.post("/doctor-applications/{application_id}/review")
def review_application(application_id: UUID, payload: ReviewInput, ctx=Depends(admin_context)):
    client, user_id = ctx
    if payload.decision == "rejected" and not (payload.reason or "").strip():
        raise HTTPException(422, "Rejection reason is required")
    try:
        result = client.rpc("review_doctor_application", {
            "p_admin_user_id": user_id,
            "p_application_id": str(application_id),
            "p_decision": payload.decision,
            "p_reason": (payload.reason or "").strip()
        }).execute().data
    except Exception as exc:
        code = getattr(exc, "code", None)
        if code == "PT403":
            raise HTTPException(403, "Administrator access denied") from exc
        if code == "PT404":
            raise HTTPException(404, "Application not found") from exc
        if code == "PT409":
            raise HTTPException(409, "Application already reviewed") from exc
        raise HTTPException(503, "Application review unavailable") from exc
    return {"id": str(application_id), "status": result, "persisted": True}
