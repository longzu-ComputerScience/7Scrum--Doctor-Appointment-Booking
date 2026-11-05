"""Admin auth boundary tests; do not require a live Supabase database."""
from fastapi.testclient import TestClient

from app.admin import admin_context
from app.main import app

client = TestClient(app)


def test_admin_requires_authentication():
    response = client.get("/api/admin/doctor-applications")
    assert response.status_code == 401
    response = client.post(
        "/api/admin/doctor-applications/00000000-0000-0000-0000-000000000001/review",
        json={"decision": "approved"},
    )
    assert response.status_code == 401


def test_admin_cannot_review_without_reason():
    class FakeClient:
        pass

    app.dependency_overrides[admin_context] = lambda: (FakeClient(), "00000000-0000-0000-0000-000000000001")
    try:
        response = client.post(
            "/api/admin/doctor-applications/00000000-0000-0000-0000-000000000001/review",
            json={"decision": "rejected", "reason": " "},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_admin_decision_schema_rejects_invalid_status():
    app.dependency_overrides[admin_context] = lambda: (object(), "00000000-0000-0000-0000-000000000001")
    try:
        response = client.post(
            "/api/admin/doctor-applications/00000000-0000-0000-0000-000000000001/review",
            json={"decision": "pending"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
