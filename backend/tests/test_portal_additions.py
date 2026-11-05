"""Targeted regression tests for the new Patient, media and approval boundaries."""
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import service
from app.main import app
from app.schemas import DoctorProfile


def test_patient_appointments_need_auth():
    response = TestClient(app).get("/api/patient/appointments")
    assert response.status_code == 401


def test_avatar_upload_endpoint_is_disabled_without_storage_schema():
    assert TestClient(app).put(
        "/api/profile/avatar",
        headers={"Authorization": "Bearer anything"},
        files={"image": ("avatar.png", b"fake", "image/png")},
    ).status_code == 404


def test_specialties_can_be_derived_from_active_demo_catalog(monkeypatch):
    monkeypatch.setattr(service, "is_database_configured", lambda: False)
    data = service.list_specialties()
    expected = sorted({
        doctor["specialty"] for doctor in service.DEMO_DOCTORS
        if doctor.get("active", True)
    })
    assert data == {"specialties": expected}


def test_patient_appointments_query_scoped_to_authenticated_user(monkeypatch):
    calls = []
    user_id = "40000000-0000-4000-8000-000000000001"

    class Query:
        def select(self, *_args): return self
        def eq(self, column, value):
            calls.append((column, value))
            return self
        def order(self, *_args, **_kwargs): return self
        def limit(self, *_args): return self
        def execute(self): return SimpleNamespace(data=[])

    class Db:
        def table(self, name):
            assert name == "appointments"
            return Query()

    monkeypatch.setattr(service, "_authenticated_user", lambda token: (Db(), user_id, "synthetic@example.test"))
    monkeypatch.setattr(service, "_patient_identity", lambda client, uid, email: object())
    result = service.list_patient_appointments("valid-test-jwt")
    assert result == {"appointments": []}
    assert calls == [("patient_auth_user_id", user_id)]


def test_pending_doctor_cannot_use_protected_dashboard(monkeypatch):
    doctor = DoctorProfile(
        id=UUID("10000000-0000-4000-8000-000000000001"),
        name="Doctor Pending", specialty="Da liễu", active=False,
    )
    monkeypatch.setattr(service, "_authenticated_user", lambda token: (object(), "uid", "pending@example.test"))
    monkeypatch.setattr(service, "_doctor_identity", lambda client, uid: doctor)
    with pytest.raises(HTTPException) as raised:
        service._authorized_doctor("token")
    assert raised.value.status_code == 403


def test_patient_appointments_returns_saved_booking(monkeypatch):
    """A saved booking appears in the Patient API contract without any new DB migration."""
    from types import SimpleNamespace

    user_id = "40000000-0000-4000-8000-000000000001"
    doctor_id = "20000000-0000-4000-8000-000000000001"
    appointment_id = "30000000-0000-4000-8000-000000000001"
    scoped = []

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *_args):
            return self

        def eq(self, key, value):
            scoped.append((self.table, key, value))
            return self

        def in_(self, column, values):
            assert column == "id"
            assert values == [doctor_id]
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            if self.table == "appointments":
                return SimpleNamespace(data=[{
                    "id": appointment_id, "booking_reference": "ABCDEF123456",
                    "booking_doctor_id": doctor_id,
                    "booking_start_at": "2026-11-07T02:00:00+00:00",
                    "booking_end_at": "2026-11-07T02:30:00+00:00",
                    "status": "confirmed",
                }])
            if self.table == "doctors":
                return SimpleNamespace(data=[{
                    "id": doctor_id, "name": "Doctor Example",
                    "specialty": "Cardiology", "address": "Clinic A", "district": "Thu Duc",
                }])
            raise AssertionError("Unexpected table")

    class Db:
        def table(self, name):
            assert name in {"appointments", "doctors"}
            return Query(name)

    monkeypatch.setattr(service, "_authenticated_user", lambda token: (Db(), user_id, "patient@example.test"))
    monkeypatch.setattr(service, "_patient_identity", lambda client, uid, email: object())

    response = TestClient(app).get(
        "/api/patient/appointments", headers={"Authorization": "Bearer verified-jwt"}
    )
    assert response.status_code == 200
    appointments = response.json()["appointments"]
    assert len(appointments) == 1
    assert appointments[0]["id"] == appointment_id
    assert appointments[0]["doctorId"] == doctor_id
    assert appointments[0]["doctorName"] == "Doctor Example"
    assert appointments[0]["bookingReference"] == "ABCDEF123456"
    assert appointments[0]["status"] == "confirmed"
    assert ("appointments", "patient_auth_user_id", user_id) in scoped


def test_health_advertises_patient_appointments_contract():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-carely-backend-capabilities"] == "patient-appointments-v1"
    assert response.headers["cache-control"] == "no-store"
