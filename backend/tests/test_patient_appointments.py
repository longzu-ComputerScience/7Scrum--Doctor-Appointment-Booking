"""Patient appointment history: authenticated, scoped, read-only."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main, service

PATIENT_A = "40000000-0000-4000-8000-000000000001"
PATIENT_B = "40000000-0000-4000-8000-000000000002"
DOCTOR = "10000000-0000-4000-8000-000000000001"
VISIT_ID = "20000000-0000-4000-8000-000000000001"
RECORD = {
    "id": VISIT_ID, "booking_reference": "ABCDEF123456", "booking_doctor_id": DOCTOR,
    "booking_start_at": "2030-01-02T02:00:00+00:00",
    "booking_end_at": "2030-01-02T02:30:00+00:00", "status": "confirmed",
    "patient_auth_user_id": PATIENT_A,
}
DOCTOR_ROW = {"id": DOCTOR, "name": "Dr. Example", "specialty": "General",
              "address": "Clinic", "district": "District 1"}


class FakeDatabase:
    def __init__(self):
        self.calls = []
        self.fail = False

    def table(self, name):
        database = self

        class Query:
            def __init__(self):
                self.filters = []

            def select(self, fields):
                database.calls.append((name, "select", fields))
                return self

            def eq(self, key, value):
                database.calls.append((name, "eq", key, value))
                self.filters.append((key, "eq", value))
                return self

            def in_(self, key, values):
                database.calls.append((name, "in", key, values))
                self.filters.append((key, "in", values))
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, *_args):
                return self

            def execute(self):
                if database.fail:
                    raise RuntimeError("offline")
                rows = [RECORD, {**RECORD, "id": "20000000-0000-4000-8000-000000000002",
                                 "patient_auth_user_id": PATIENT_B}] if name == "appointments" else [DOCTOR_ROW]
                rows = [r for r in rows if all(
                    (r.get(key) == value if method == "eq" else r.get(key) in value)
                    for key, method, value in self.filters
                )]
                return SimpleNamespace(data=rows)

        return Query()


@pytest.fixture
def api(monkeypatch):
    database = FakeDatabase()
    def authenticate(token):
        if token == "doctor-token":
            return database, PATIENT_A, "doctor@example.invalid"
        user = PATIENT_B if token == "patient-b" else PATIENT_A
        return database, user, "patient@example.invalid"

    def authorize_patient(_client, user_id, email):
        if email == "doctor@example.invalid":
            raise HTTPException(403, "Patient access denied")
        return SimpleNamespace(id=user_id)

    monkeypatch.setattr(service, "_authenticated_user", authenticate)
    monkeypatch.setattr(service, "_patient_identity", authorize_patient)
    return TestClient(main.app), database


def test_patient_only_sees_own_bookings(api):
    client, database = api
    response = client.get("/api/patient/appointments", headers={"Authorization": "Bearer patient-a"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["appointments"] == [{
        "id": VISIT_ID, "doctorId": DOCTOR, "bookingReference": "ABCDEF123456",
        "doctorName": "Dr. Example", "specialty": "General", "address": "Clinic", "district": "District 1",
        "startAt": "2030-01-02T02:00:00Z", "endAt": "2030-01-02T02:30:00Z", "status": "confirmed",
    }]
    assert ("appointments", "eq", "patient_auth_user_id", PATIENT_A) in database.calls
    database.calls.clear()
    result_b = client.get("/api/patient/appointments", headers={"Authorization": "Bearer patient-b"})
    assert result_b.status_code == 200
    assert len(result_b.json()["appointments"]) == 1
    assert result_b.json()["appointments"][0]["id"] != VISIT_ID
    assert ("appointments", "eq", "patient_auth_user_id", PATIENT_B) in database.calls


def test_listing_requires_valid_patient_session(api):
    client, database = api
    assert client.get("/api/patient/appointments").status_code == 401
    assert client.get("/api/patient/appointments", headers={"Authorization": "Bearer doctor-token"}).status_code == 403
    assert not any(item[0] == "appointments" for item in database.calls)


def test_provider_errors_are_not_empty_appointment_histories(api):
    client, database = api
    database.fail = True
    response = client.get("/api/patient/appointments", headers={"Authorization": "Bearer patient-a"})
    assert response.status_code == 503
    assert "appointments" not in response.json()
