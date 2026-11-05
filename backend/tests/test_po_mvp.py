"""New PO-approved 3-story contract tests. Live Supabase E2E is a separate release gate."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app import main, service
from app.schemas import BookingInput, StaffSlotInput


def test_chatbot_followup_and_dermatology(monkeypatch):
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    client = TestClient(main.app)
    first = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ"]})
    assert first.status_code == 200
    assert first.json()["followUpRequired"] is True
    assert first.json()["specialty"] is None

    second = client.post(
        "/api/consult",
        json={"messages": ["Tôi bị nổi mẩn đỏ", "Khoảng hai ngày nay"]},
    )
    assert second.status_code == 200
    data = second.json()
    assert data["followUpRequired"] is False
    assert data["specialty"] == "Da liễu"
    # Synthetic records are explicitly marked demo and booking remains disabled.
    assert data["demoMode"] is True
    assert len(data["doctors"]) == 1
    assert data["doctors"][0]["name"].endswith("(Demo)")
    assert "MẪU" in data["reply"]
    assert data["mode"] == "rule-based"


def test_consultation_emergency_and_validation(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(main.app)
    emergency = client.post("/api/consult", json={"messages": ["Tôi bị đau ngực dữ dội"]})
    assert emergency.status_code == 200
    assert emergency.json()["urgent"] is True
    assert emergency.json()["doctors"] == []
    invalid = client.post("/api/consult", json={"messages": ["x"]})
    assert invalid.status_code == 422


def test_staff_schedule_auth_and_input_validation():
    client = TestClient(main.app)
    assert client.get("/api/staff/doctors").status_code == 401
    assert client.get("/api/staff/slots").status_code == 401
    future = datetime.now(timezone.utc) + timedelta(days=1)
    payload = {
        "doctorId": "10000000-0000-4000-8000-000000000001",
        "startAt": future.isoformat(),
        "endAt": (future + timedelta(minutes=30)).isoformat(),
    }
    assert client.post("/api/staff/slots", json=payload).status_code == 401
    assert client.post("/api/staff/slots", headers={"Authorization": "Bearer abc"}, json={
        **payload, "endAt": (future + timedelta(minutes=5)).isoformat(),
    }).status_code == 422


def test_schedule_rejects_wrong_clinic_doctor(monkeypatch):
    class Query:
        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def execute(self):
            return type("Response", (), {
                "data": [{"id": "10000000-0000-4000-8000-000000000001",
                          "clinic_id": "20000000-0000-4000-8000-000000000001", "active": True}]
            })()

    class FakeClient:
        def table(self, name):
            assert name == "doctors"
            return Query()

    monkeypatch.setattr(service, "authorized_staff", lambda token: (FakeClient(), [
        "20000000-0000-4000-8000-000000000002",
    ]))
    start = datetime.now(timezone.utc) + timedelta(days=1)
    payload = StaffSlotInput(
        doctorId=UUID("10000000-0000-4000-8000-000000000001"),
        startAt=start, endAt=start + timedelta(minutes=30),
    )
    try:
        service.create_staff_slot(payload, "token")
        assert False, "Expected forbidden"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 403


def test_new_booking_v2_contract(monkeypatch):
    # Unit-level RPC contract; database concurrency and notification atomicity
    # are tested separately against PostgreSQL/Supabase.
    appointment_id = "50000000-0000-4000-8000-000000000001"
    booking_reference = "A1B2C3D4E5F6"
    patient_id = "40000000-0000-4000-8000-000000000001"
    slot_id = "30000000-0000-4000-8000-000000000109"

    class FakeRPC:
        def execute(self):
            return type("Result", (), {"data": [{
                "appointment_id": appointment_id,
                "booking_reference": booking_reference,
                "status": "confirmed",
                "start_at": "2026-11-06T02:00:00Z",
                "end_at": "2026-11-06T02:30:00Z",
            }]})()

    class FakeClient:
        def rpc(self, name, params):
            assert name == "book_recurring_appointment"
            assert params == {
                "p_user_id": patient_id,
                "p_slot_id": slot_id,
                "p_notes": "Follow-up",
            }
            return FakeRPC()

    def authenticated_user(token):
        assert token == "patient-jwt"
        return FakeClient(), patient_id, "patient@example.test"

    monkeypatch.setattr(service, "_authenticated_user", authenticated_user)
    payload = BookingInput(
        slotId=UUID(slot_id),
        patientName="Demo Patient", patientPhone="0900000000",
        notes="Follow-up",
    )
    assert service.create_booking(payload, "patient-jwt") == {
        "appointmentId": appointment_id,
        "bookingReference": booking_reference,
        "status": "confirmed",
    }
