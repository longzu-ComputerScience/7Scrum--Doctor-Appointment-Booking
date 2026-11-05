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


def test_admin_lists_only_pending_applications():
    from types import SimpleNamespace

    class FakeQuery:
        def __init__(self):
            self.filters = []

        def select(self, _columns):
            return self

        def eq(self, key, value):
            self.filters.append((key, value))
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, _count):
            return self

        def execute(self):
            assert ("status", "pending") in self.filters
            return SimpleNamespace(data=[{
                "id": "00000000-0000-0000-0000-000000000001",
                "full_name": "Demo Doctor", "email": "doctor@example.test",
                "specialty": "Dermatology", "license_number": "DEMO-01",
                "hospital": "Demo clinic", "experience_years": 5,
                "submitted_at": "2026-11-05T01:00:00+00:00",
                "status": "pending", "bio": "", "documents": [], "review_note": None,
            }])

    class FakeClient:
        def table(self, table_name):
            assert table_name == "doctor_applications"
            return FakeQuery()

    app.dependency_overrides[admin_context] = lambda: (FakeClient(), "00000000-0000-0000-0000-000000000002")
    try:
        response = client.get("/api/admin/doctor-applications")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert len(response.json()["applications"]) == 1
        assert response.json()["applications"][0]["status"] == "pending"
    finally:
        app.dependency_overrides.clear()
