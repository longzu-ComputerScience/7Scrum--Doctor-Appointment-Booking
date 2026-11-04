"""New PO-approved 3-story contract tests. Live Supabase E2E is a separate release gate."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import Client, MockTransport, Response
from postgrest import SyncPostgrestClient

from app import main, service
from app.schemas import StaffSlotInput


USER_ID = "10000000-0000-4000-8000-000000000001"
SLOT_ID = "30000000-0000-4000-8000-000000000109"
APPOINTMENT_ID = "50000000-0000-4000-8000-000000000001"
NOTIFICATION_ID = "60000000-0000-4000-8000-000000000001"
AUTH = {"Authorization": "Bearer verified-session"}
START = "2099-01-01T02:00:00Z"
END = "2099-01-01T02:30:00Z"


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
    assert len(data["doctors"]) == 1
    assert data["mode"] == "controlled-prototype"


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
    def book(rpc, params):
        assert rpc == "book_recurring_appointment"
        assert params == {"p_user_id": USER_ID, "p_slot_id": SLOT_ID, "p_notes": "Follow-up"}
        return [{"appointment_id": APPOINTMENT_ID, "booking_reference": "A1B2C3D4E5F6", "status": "confirmed"}]

    use_db(monkeypatch, book)
    response = TestClient(main.app).post("/api/appointments", headers=AUTH, json={
        "slotId": SLOT_ID, "patientName": "Demo Patient", "patientPhone": "0900000000", "notes": "Follow-up",
    })
    assert response.status_code == 201
    assert response.json() == {
        "appointmentId": APPOINTMENT_ID, "bookingReference": "A1B2C3D4E5F6", "status": "confirmed",
    }


@pytest.mark.parametrize(("code", "status"), [("PT403", 403), ("PT409", 409), ("PGRST202", 503)])
def test_booking_rpc_errors(monkeypatch, code, status):
    def book(*_):
        raise DatabaseError(code)

    use_db(monkeypatch, book)
    response = TestClient(main.app).post("/api/appointments", headers=AUTH, json={
        "slotId": SLOT_ID, "patientName": "Demo Patient", "patientPhone": "0900000000",
    })
    assert response.status_code == status
    assert "appointmentId" not in response.json()


def test_schedule_conflicts_pass_through_as_json(monkeypatch):
    conflict = {"appointmentId": APPOINTMENT_ID, "startAt": START, "endAt": END}

    def save(rpc, params):
        assert rpc == "save_doctor_working_hours"
        assert params == {
            "p_user_id": USER_ID, "p_effective_from": "2099-01-01",
            "p_intervals": [{"weekday": 1, "startMinute": 1410, "endMinute": 1440}],
        }
        raise DatabaseError("PT409", "Schedule conflicts with confirmed appointments", json.dumps([conflict]))

    db = use_db(monkeypatch, save)
    monkeypatch.setattr(service, "_authorized_doctor", lambda _: (db, USER_ID, None))
    response = TestClient(main.app).put("/api/doctor/schedule", headers=AUTH, json={
        "effectiveDate": "2099-01-01",
        "weeklyIntervals": [{"dayOfWeek": 1, "startTime": "23:30", "endTime": "24:00"}],
    })
    assert response.status_code == 409
    assert response.json() == {"error": "SCHEDULE_CONFLICT", "conflicts": [conflict]}


def test_invalid_registration_hides_secrets():
    response = TestClient(main.app).post("/api/auth/doctors/register", json={
        "email": "doctor@example.test", "password": "test-only-password", "invitationCode": "test-only-invite",
        "weeklyIntervals": [
            {"dayOfWeek": 1, "startTime": "09:00", "endTime": "11:00"},
            {"dayOfWeek": 1, "startTime": "10:00", "endTime": "12:00"},
        ],
    })
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "weeklyIntervals"]
    assert "test-only" not in response.text


@pytest.mark.parametrize(("code", "status", "deleted"), [("PT403", 403, [USER_ID]), (None, 503, [])])
def test_doctor_registration_compensation(monkeypatch, code, status, deleted):
    def register(rpc, params):
        assert rpc == "complete_doctor_registration"
        assert params == {
            "p_user_id": USER_ID, "p_invite_code": "test-only-invite",
            "p_intervals": [{"weekday": 1, "startMinute": 540, "endMinute": 660}],
        }
        raise DatabaseError(code)

    db = use_db(monkeypatch, register)
    response = TestClient(main.app).post("/api/auth/doctors/register", json={
        "email": "doctor@example.test", "password": "test-only-password", "invitationCode": "test-only-invite",
        "weeklyIntervals": [{"dayOfWeek": 1, "startTime": "09:00", "endTime": "11:00"}],
    })
    assert response.status_code == status
    assert db.deleted == deleted


def test_doctor_status_and_notification_rpc(monkeypatch):
    def write(rpc, params):
        if rpc == "update_recurring_appointment_status":
            assert params == {"p_user_id": USER_ID, "p_appointment_id": APPOINTMENT_ID, "p_status": "completed"}
            return [{"id": APPOINTMENT_ID, "status": "completed"}]
        assert rpc == "mark_doctor_notification_read"
        assert params == {"p_user_id": USER_ID, "p_notification_id": NOTIFICATION_ID}
        return START

    db = use_db(monkeypatch, write)
    monkeypatch.setattr(service, "_authorized_doctor", lambda _: (db, USER_ID, None))
    client = TestClient(main.app)
    appointment_path = f"/api/doctor/appointments/{APPOINTMENT_ID}"
    assert client.patch(appointment_path, headers=AUTH, json={"status": "checked_in"}).status_code == 422
    assert client.patch(appointment_path, headers=AUTH, json={"status": "completed"}).json() == {
        "appointment": {"id": APPOINTMENT_ID, "status": "completed"},
    }
    notification_path = f"/api/doctor/notifications/{NOTIFICATION_ID}"
    assert client.patch(notification_path, headers=AUTH, json={"read": False}).status_code == 422
    assert client.patch(notification_path, headers=AUTH, json={"read": True}).json() == {
        "notification": {"id": NOTIFICATION_ID, "readAt": START},
    }


def test_generated_availability_uses_doctor_and_date_range(monkeypatch):
    def respond(request):
        if request.url.path == "/doctors":
            assert request.url.params["id"] == f"eq.{USER_ID}"
            assert request.url.params["active"] == "eq.true"
            return Response(200, json=[{"id": USER_ID}])

        assert request.url.path == "/rpc/list_doctor_availability"
        assert request.method == "POST"
        assert json.loads(request.content) == {
            "p_doctor_id": USER_ID, "p_from": "2099-01-01", "p_to": "2099-01-02",
        }
        if "start_at" in request.url.params:
            assert request.url.params["start_at"] == f"gt.{START}"
            return Response(200, json=[])
        return Response(200, json=[{"slot_id": SLOT_ID, "start_at": START, "end_at": END}])

    monkeypatch.setattr(service, "is_database_configured", lambda: True)
    with SyncPostgrestClient("http://database.test") as db:
        db.session = Client(base_url="http://database.test", transport=MockTransport(respond))
        monkeypatch.setattr(service, "get_client", lambda: db)
        client = TestClient(main.app)
        path = f"/api/doctors/{USER_ID}/slots"
        response = client.get(path, params={"from": "2099-01-01", "to": "2099-01-02"})
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.json() == {
            "slots": [{"id": SLOT_ID, "doctorId": USER_ID, "startAt": START, "endAt": END}], "demoMode": False,
        }
        assert client.get(path, params={"from": "2099-01-01", "to": "2099-02-01"}).status_code == 422
        assert client.get(path, params={"from": "2099-W01-1"}).status_code == 422


class DatabaseError(Exception):
    def __init__(self, code, message="", details=None):
        self.code = code
        self.message = message
        self.details = details


def use_db(monkeypatch, rpc_handler):
    user = SimpleNamespace(id=USER_ID, email="doctor@example.test")

    class FakeDatabase:
        def __init__(self):
            self.deleted = []
            self.auth = SimpleNamespace(get_user=self.get_user, admin=SimpleNamespace(
                create_user=self.create_user, delete_user=self.deleted.append,
            ))

        def get_user(self, token):
            assert token == "verified-session"
            return SimpleNamespace(user=user)

        def create_user(self, attributes):
            assert attributes == {"email": user.email, "password": "test-only-password", "email_confirm": False}
            return SimpleNamespace(user=user)

        def rpc(self, rpc, params):
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=rpc_handler(rpc, params)))

        def table(self, name):
            assert name == "doctor_schedule_versions"
            return self

        def select(self, column):
            assert column == "id"
            return self

        def limit(self, count):
            assert count == 1
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    db = FakeDatabase()
    monkeypatch.setattr(service, "get_client", lambda: db)
    return db
