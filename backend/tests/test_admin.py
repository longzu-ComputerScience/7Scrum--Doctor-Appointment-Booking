"""Read-only admin authorization and doctor-directory contracts."""
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.admin import admin_context
from app.main import app

client = TestClient(app)
ADMIN_ID = "00000000-0000-4000-8000-000000000001"


def test_admin_directory_requires_login():
    assert client.get("/api/admin/doctors").status_code == 401


def test_admin_denied_without_server_side_allowlist(monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    monkeypatch.setattr(
        "app.admin._authenticated_user", lambda token: (object(), ADMIN_ID, "admin@example.test")
    )
    assert client.get("/api/admin/doctors", headers={"Authorization": "Bearer valid"}).status_code == 403


def test_admin_allowlist_does_not_trust_email_or_metadata(monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "00000000-0000-4000-8000-000000000002")
    monkeypatch.setattr(
        "app.admin._authenticated_user", lambda token: (object(), ADMIN_ID, "admin@example.test")
    )
    assert client.get("/api/admin/doctors", headers={"Authorization": "Bearer valid"}).status_code == 403


def test_admin_directory_reads_existing_table_only():
    calls = []

    class Query:
        def select(self, columns):
            calls.append(("select", columns))
            return self
        def order(self, column):
            calls.append(("order", column))
            return self
        def limit(self, count):
            calls.append(("limit", count))
            return self
        def execute(self):
            return SimpleNamespace(data=[
                {"id": ADMIN_ID, "name": "Dr Example", "specialty": "Cardiology",
                 "active": True, "bio": "Example", "address": "Clinic A",
                 "district": "District 1", "certificates": []}
            ])

    class Db:
        def table(self, name):
            calls.append(("table", name))
            return Query()

    app.dependency_overrides[admin_context] = lambda: (Db(), ADMIN_ID)
    try:
        resp = client.get("/api/admin/doctors")
        assert resp.status_code == 200
        assert resp.headers["cache-control"] == "no-store"
        assert resp.json()["doctors"][0]["name"] == "Dr Example"
        assert ("table", "doctors") in calls
        assert all(call[0] not in {"insert", "update", "delete", "rpc"} for call in calls)
    finally:
        app.dependency_overrides.clear()


def test_review_endpoint_is_not_exposed_without_approval_schema():
    assert client.post(
        f"/api/admin/doctor-applications/{ADMIN_ID}/review",
        json={"decision": "approved"},
        headers={"Authorization": "Bearer anything"},
    ).status_code == 404
