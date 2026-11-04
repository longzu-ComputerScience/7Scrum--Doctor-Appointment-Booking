"""MVP contract tests. Live Supabase concurrency is a separate integration check."""
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main, service
from app.demo import DEMO_DOCTORS, demo_slots
from app.schemas import ALLOWED_TRANSITIONS


class FakeCatalogQuery:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.filters: dict[str, object] = {}
        self.gt_id: str | None = None

    def select(self, *_): return self
    def neq(self, *_): return self
    def is_(self, *_): return self
    def order(self, *_, **_kw): return self
    def limit(self, *_): return self

    def eq(self, key: str, value: object):
        self.filters[key] = value
        return self

    def gt(self, key: str, value: str):
        if key == "id":
            self.gt_id = value
        return self

    def execute(self):
        if self.table_name == "doctors":
            rows = [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "specialty": d["specialty"],
                    "bio": d["bio"],
                    "clinic_id": d["clinicId"],
                    "active": True,
                    "clinics": {
                        "name": d["clinicName"],
                        "address": d["clinicAddress"],
                        "district": d["district"],
                        "active": True,
                    },
                }
                for d in DEMO_DOCTORS
            ]
            if "id" in self.filters:
                rows = [r for r in rows if r["id"] == self.filters["id"]]
            if self.gt_id is not None:
                rows = [r for r in rows if r["id"] > self.gt_id]
            return type("Response", (), {"data": rows})()

        if self.table_name == "appointment_slots":
            doc_id = str(self.filters.get("doctor_id", ""))
            raw_slots = demo_slots(UUID(doc_id)) if doc_id else []
            rows = [
                {
                    "id": s["id"],
                    "doctor_id": s["doctorId"],
                    "clinic_id": s["clinicId"],
                    "start_at": s["startAt"],
                    "end_at": s["endAt"],
                    "rooms": {"name": s["roomName"]} if s.get("roomName") else None,
                    "appointments": [],
                }
                for s in raw_slots
            ]
            return type("Response", (), {"data": rows})()

        return type("Response", (), {"data": []})()


class FakeCatalogClient:
    def table(self, name: str):
        return FakeCatalogQuery(name)


@pytest.fixture(autouse=True)
def no_live_credentials(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "BOOKING_RPC_V2_READY"):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture()
def mock_catalog(monkeypatch):
    monkeypatch.setattr(service, "get_client", lambda: FakeCatalogClient())


@pytest.fixture()
def client():
    return TestClient(main.app)


def test_health_and_catalog(client, mock_catalog):
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": False}
    response = client.get("/api/doctors")
    assert response.status_code == 200
    assert isinstance(response.json()["demoMode"], bool)
    assert len(response.json()["doctors"]) == 3


def test_filter_doctors(client, mock_catalog):
    data = client.get("/api/doctors", params={"district": "Thu Duc", "specialty": "Da lieu"}).json()
    assert len(data["doctors"]) == 1
    assert "Nguyễn Minh An" in data["doctors"][0]["name"]


def test_doctor_slots(client, mock_catalog):
    doctor = "10000000-0000-4000-8000-000000000001"
    assert client.get(f"/api/doctors/{doctor}").status_code == 200
    response = client.get(f"/api/doctors/{doctor}/slots")
    assert response.status_code == 200
    assert len(response.json()["slots"]) == 9


def test_unknown_doctor(client, mock_catalog):
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000099").status_code == 404


def test_fallback_assistant(client, mock_catalog):
    data = client.post("/api/assistant", json={"message": "Tìm bác sĩ da liễu Thủ Đức"}).json()
    assert data["usedAI"] is False
    assert data["urgent"] is False
    assert len(data["doctors"]) == 1


def test_emergency_guardrail(client):
    data = client.post("/api/assistant", json={"message": "Tôi bị đau ngực dữ dội"}).json()
    assert data["urgent"] is True
    assert data["doctors"] == []


def test_booking_refuses_to_fake_success(client):
    response = client.post("/api/appointments", json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 503


@pytest.mark.parametrize("payload", [
    {"slotId": "bad", "patientName": "Demo", "patientPhone": "0900000000"},
    {"slotId": "30000000-0000-4000-8000-000000000109", "patientName": "A", "patientPhone": "0900000000"},
    {"slotId": "30000000-0000-4000-8000-000000000109", "patientName": "Demo", "patientPhone": "bad"},
])
def test_booking_validation(client, payload):
    assert client.post("/api/appointments", json=payload).status_code == 422


def test_staff_requires_auth(client):
    assert client.get("/api/staff/appointments").status_code == 401
    assert client.patch("/api/appointments/50000000-0000-4000-8000-000000000001", json={"status": "confirmed"}).status_code == 401


def test_transitions():
    assert "completed" not in ALLOWED_TRANSITIONS["requested"]
    assert not ALLOWED_TRANSITIONS["completed"]


def test_conflict_returns_409(client, monkeypatch):
    def fail(_payload):
        raise HTTPException(409, "Slot is no longer available")
    monkeypatch.setattr(main, "create_booking", fail)
    response = client.post("/api/appointments", json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 409
    assert "Slot" in response.json()["error"]
