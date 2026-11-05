"""MVP contract tests. Live Supabase concurrency is a separate integration check."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main
from app.schemas import ALLOWED_TRANSITIONS

@pytest.fixture(autouse=True)
def no_live_credentials(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)

@pytest.fixture()
def client():
    return TestClient(main.app)

def test_health_and_catalog(client):
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": False}
    response = client.get("/api/doctors")
    assert response.status_code == 200
    assert response.json()["demoMode"] is True
    assert len(response.json()["doctors"]) == 3

def test_filter_doctors(client):
    data = client.get("/api/doctors", params={"district": "Thu Duc", "specialty": "Da lieu"}).json()
    assert len(data["doctors"]) == 1
    assert "Nguyễn Minh An" in data["doctors"][0]["name"]

def test_doctor_slots(client):
    doctor = "10000000-0000-4000-8000-000000000001"
    assert client.get(f"/api/doctors/{doctor}").status_code == 200
    response = client.get(f"/api/doctors/{doctor}/slots")
    assert response.status_code == 200
    assert len(response.json()["slots"]) == 9

def test_unknown_doctor(client):
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000099").status_code == 404

def test_fallback_assistant(client):
    data = client.post("/api/assistant", json={"message": "Tìm bác sĩ da liễu Thủ Đức"}).json()
    assert data["usedAI"] is False
    assert data["urgent"] is False
    assert len(data["doctors"]) == 1

def test_emergency_guardrail(client):
    data = client.post("/api/assistant", json={"message": "Tôi bị đau ngực dữ dội"}).json()
    assert data["urgent"] is True
    assert data["doctors"] == []

def test_booking_requires_auth(client):
    response = client.post("/api/appointments", json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 401
    assert response.json()["error"] == "Login required"


def test_booking_refuses_to_fake_success(client):
    # A Bearer header passes request authentication syntax, but without a
    # configured database no booking can be written or reported as confirmed.
    response = client.post("/api/appointments", headers={
        "Authorization": "Bearer patient-jwt",
    }, json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 503
    assert "status" not in response.json()

@pytest.mark.parametrize("payload", [
    {"slotId": "bad", "patientName": "Demo", "patientPhone": "0900000000"},
    {"slotId": "30000000-0000-4000-8000-000000000109", "patientName": "A", "patientPhone": "0900000000"},
    {"slotId": "30000000-0000-4000-8000-000000000109", "patientName": "Demo", "patientPhone": "bad"},
])
def test_booking_validation(client, payload):
    # Supply a syntactically valid Bearer header so request-body validation
    # is tested independently of the unauthenticated (401) behavior.
    response = client.post("/api/appointments", headers={
        "Authorization": "Bearer patient-jwt",
    }, json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == "Invalid input"

def test_staff_requires_auth(client):
    assert client.get("/api/staff/appointments").status_code == 401
    assert client.patch("/api/appointments/50000000-0000-4000-8000-000000000001", json={"status": "confirmed"}).status_code == 401

def test_transitions():
    assert "completed" not in ALLOWED_TRANSITIONS["requested"]
    assert not ALLOWED_TRANSITIONS["completed"]

def test_conflict_returns_409(client, monkeypatch):
    def fail(_payload, token):
        assert token == "patient-jwt"
        raise HTTPException(409, "Slot is no longer available")

    monkeypatch.setattr(main, "create_booking", fail)
    response = client.post("/api/appointments", headers={
        "Authorization": "Bearer patient-jwt",
    }, json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 409
    assert response.json() == {"error": "Slot is no longer available"}


def test_booking_confirmed_response_contract(client, monkeypatch):
    appointment_id = "50000000-0000-4000-8000-000000000001"

    def confirmed(payload, token):
        assert token == "patient-jwt"
        assert str(payload.slotId) == "30000000-0000-4000-8000-000000000109"
        return {
            "appointmentId": appointment_id,
            "bookingReference": "A1B2C3D4E5F6",
            "status": "confirmed",
        }

    monkeypatch.setattr(main, "create_booking", confirmed)
    response = client.post("/api/appointments", headers={
        "Authorization": "Bearer patient-jwt",
    }, json={
        "slotId": "30000000-0000-4000-8000-000000000109",
        "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == 201
    assert response.json() == {
        "appointmentId": appointment_id,
        "bookingReference": "A1B2C3D4E5F6",
        "status": "confirmed",
    }
