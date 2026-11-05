"""Auth boundaries, database identities and registration rollback (isolated provider)."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main, service

PATIENT_ID = "40000000-0000-4000-8000-000000000001"
DOCTOR_ID = "10000000-0000-4000-8000-000000000001"
VERSION_ID = "50000000-0000-4000-8000-000000000001"
DOCTOR = {"id": DOCTOR_ID, "name": "Synthetic Doctor", "specialty": "Test", "active": True}
PASSWORD = "test-password-secret"
INVITE = "synthetic-invitation-code-32-chars"


class ProviderError(Exception):
    def __init__(self, code, status=400, message="Provider refused request"):
        self.code, self.status, self.message = code, status, message


class Provider:
    def __init__(self):
        self.deleted = []
        self.rows = {"patient_profiles": [{"full_name": "Synthetic Patient", "phone": "0900000000"}],
                     "doctor_accounts": [], "doctor_schedule_versions": []}
        self.auth = SimpleNamespace(get_user=self.get_user,
                                    admin=SimpleNamespace(create_user=self.create_user, delete_user=self.deleted.append))
        self.calls, self.created, self.rpc_calls = [], [], []
        self.auth_error = self.rpc_error = self.table_error = None

    def get_user(self, token):
        self.calls.append(("get_user", token))
        if self.auth_error:
            raise self.auth_error
        # User-editable metadata must never grant a doctor role.
        return SimpleNamespace(user=SimpleNamespace(id=PATIENT_ID, email="synthetic@example.invalid",
                                                     user_metadata={"role": "doctor"}))

    def create_user(self, body):
        self.created.append(body)
        return SimpleNamespace(user=SimpleNamespace(id=PATIENT_ID))

    def table(self, name):
        if self.table_error:
            raise self.table_error
        provider = self

        class Query:
            def select(self, *_):
                return self

            def eq(self, key, value):
                provider.calls.append((name, key, value))
                return self

            def limit(self, *_):
                return self

            def execute(self):
                return SimpleNamespace(data=provider.rows[name])

        return Query()

    def rpc(self, name, body):
        self.rpc_calls.append((name, body))

        def execute():
            if self.rpc_error:
                raise self.rpc_error
            result = PATIENT_ID if name == "save_patient_profile" else [
                {"doctor_id": DOCTOR_ID, "schedule_version_id": VERSION_ID},
            ]
            return SimpleNamespace(data=result)

        return SimpleNamespace(execute=execute)


@pytest.fixture
def auth(monkeypatch):
    provider = Provider()
    monkeypatch.setattr(service, "get_client", lambda: provider)
    return TestClient(main.app), provider


def headers(token="verified-jwt"):
    return {"Authorization": f"Bearer {token}"}


def patient_body():
    return {"name": "  Synthetic Patient  ", "phone": "0900000000", "email": " SYNTHETIC@example.invalid ",
            "password": PASSWORD}


def doctor_body():
    return {"email": "synthetic@example.invalid", "password": PASSWORD, "invitationCode": f" {INVITE} ",
            "weeklyIntervals": [{"dayOfWeek": 1, "startTime": "09:00", "endTime": "12:00"}]}


def test_identity_requires_bearer_token(auth):
    client, provider = auth
    for value in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}):
        response = client.get("/api/auth/me", headers=value)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
    assert provider.calls == []


def test_patient_role_is_derived_from_database_not_metadata(auth):
    client, provider = auth
    response = client.get("/api/auth/me", headers=headers())
    assert response.status_code == 200
    assert response.json() == {"role": "patient", "patient": {
        "id": PATIENT_ID, "name": "Synthetic Patient", "phone": "0900000000", "email": "synthetic@example.invalid",
    }}
    assert response.headers["cache-control"] == "no-store"
    assert provider.calls.count(("get_user", "verified-jwt")) == 1
    assert ("patient_profiles", "auth_user_id", PATIENT_ID) in provider.calls
    assert client.get("/api/doctor/me", headers=headers()).status_code == 403


def test_doctor_identity_uses_linked_profile_and_skips_patient_query(auth):
    client, provider = auth
    provider.rows["doctor_accounts"] = [{"doctors": DOCTOR}]
    provider.rows["patient_profiles"] = []
    response = client.get("/api/auth/me", headers=headers())
    assert response.json() == {"role": "doctor", "doctor": DOCTOR}
    assert not any(call[0] == "patient_profiles" for call in provider.calls)
    assert client.get("/api/patient/me", headers=headers()).status_code == 403


def test_auth_account_without_app_profile_is_not_assigned_a_role(auth):
    client, provider = auth
    provider.rows["patient_profiles"] = []
    assert client.get("/api/auth/me", headers=headers()).status_code == 403


@pytest.mark.parametrize(("error", "expected"), [
    (ProviderError("bad_jwt", 401), 401),
    (ProviderError("session_not_found", 403), 401),
    (ProviderError("invalid_api_key", 401, "Invalid API key"), 503),
    (RuntimeError("network failure"), 503),
])
def test_invalid_session_and_infrastructure_failure_stay_distinct(auth, error, expected):
    client, provider = auth
    provider.auth_error = error
    response = client.get("/api/auth/me", headers=headers())
    assert response.status_code == expected
    assert response.headers["cache-control"] == "no-store"
    assert "verified-jwt" not in response.text


def test_profile_database_failure_never_falls_back_to_a_different_role(auth):
    client, provider = auth
    provider.table_error = RuntimeError("database unavailable")
    assert client.get("/api/auth/me", headers=headers()).status_code == 503


def test_patient_registration_creates_immediately_usable_user_and_linked_profile(auth):
    client, provider = auth
    response = client.post("/api/auth/patients/register", json=patient_body())
    assert response.status_code == 201
    assert response.json() == {"userId": PATIENT_ID}
    assert provider.created == [{"email": "synthetic@example.invalid", "password": PASSWORD, "email_confirm": True}]
    assert provider.rpc_calls == [("save_patient_profile", {
        "p_user_id": PATIENT_ID, "p_full_name": "Synthetic Patient", "p_phone": "0900000000",
    })]
    assert PASSWORD not in response.text


def test_doctor_registration_atomically_links_invitation_and_weekly_hours(auth):
    client, provider = auth
    response = client.post("/api/auth/doctors/register", json=doctor_body())
    assert response.status_code == 201
    assert response.json() == {"doctorId": DOCTOR_ID}
    assert provider.rpc_calls == [("complete_doctor_registration", {
        "p_user_id": PATIENT_ID, "p_invite_code": INVITE,
        "p_intervals": [{"weekday": 1, "startMinute": 540, "endMinute": 720}],
    })]
    assert provider.created[0]["email_confirm"] is True
    assert INVITE not in response.text and PASSWORD not in response.text


@pytest.mark.parametrize(("code", "status", "deleted"), [
    ("PT403", 403, True), ("PT409", 409, True), ("PT422", 422, True), ("23514", 503, True),
    ("PGRST202", 503, True), ("network_error", 503, False),
])
def test_registration_rolls_back_rejected_transactions_but_preserves_unknown_outcomes(auth, code, status, deleted):
    client, provider = auth
    provider.rpc_error = ProviderError(code)
    response = client.post("/api/auth/doctors/register", json=doctor_body())
    assert response.status_code == status
    assert provider.deleted == ([PATIENT_ID] if deleted else [])


def test_registration_rejects_bad_invitation_overlaps_and_role_injection_before_auth_creation(auth):
    client, provider = auth
    for body in [
        {**doctor_body(), "invitationCode": "too-short"},
        {**doctor_body(), "weeklyIntervals": []},
        {**doctor_body(), "weeklyIntervals": doctor_body()["weeklyIntervals"] * 2},
        {**doctor_body(), "role": "doctor", "doctorId": DOCTOR_ID},
    ]:
        response = client.post("/api/auth/doctors/register", json=body)
        assert response.status_code == 422
        assert PASSWORD not in response.text and INVITE not in response.text
    assert client.post("/api/auth/patients/register", json={**patient_body(), "role": "doctor"}).status_code == 422
    assert provider.created == []
