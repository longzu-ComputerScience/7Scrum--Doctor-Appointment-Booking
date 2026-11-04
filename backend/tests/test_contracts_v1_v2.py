"""Comprehensive test suite covering PO 2-Day MVP (Contract v1) and Target Contract v2.

Covers:
- US-01: Consultation chatbot (/api/consult) & Assistant search (/api/assistant)
  - Multi-turn follow-up flow, specialty mapping, emergency guardrails, AI tool-call & fallback
- US-02: Doctor catalog, detail, slot discovery, and atomic booking (/api/doctors*, /api/appointments)
  - Accent-insensitive & alias filtering, pagination before LIMIT 100, strict Pydantic v2 validation,
    Unicode NFC normalization, phone ASCII digit rules, RPC error handling (409/503)
- US-03: Staff authentication, clinic authorization, schedule creation, and appointment management
  - Bearer token parsing, staff_members clinic check, slot duration/window validation, overlap 409,
    slot availability calculation, and appointment status transition matrix (PATCH /api/appointments/{id})
- End-to-End 6-Step Dermatology Acceptance Scenario (docs/ACCEPTANCE_SCENARIO.md)
"""
from datetime import datetime, timedelta, timezone
import unicodedata

from fastapi.testclient import TestClient
import httpx
import pytest

from app import assistant, config, main, service


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "BOOKING_RPC_V2_READY", "CORS_ORIGINS"):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture()
def client():
    return TestClient(main.app)


# ==============================================================================
# 1. Health & Configuration Tests
# ==============================================================================

def test_health_database_configured_states(client, monkeypatch):
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": False}

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": False}

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-secret-key")
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": True}


def test_allowed_origins_parsing(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", " http://localhost:3000/ , https://app.example.com/ , ")
    assert config.allowed_origins() == ["http://localhost:3000", "https://app.example.com"]


# ==============================================================================
# 2. US-01: Consultation (/api/consult) & Assistant (/api/assistant)
# ==============================================================================

@pytest.mark.parametrize(
    "urgent_phrase",
    [
        "Tôi bị đau ngực dữ dội từ sáng",
        "Bệnh nhân khó thở nghiêm trọng",
        "Khó thở cấp tính không nằm được",
        "Người nhà bị bất tỉnh",
        "Trẻ co giật liên tục",
        "Vết thương chảy máu không cầm",
        "I have severe chest pain",
        "Patient has difficulty breathing",
        "He is unconscious",
    ],
)
def test_us01_emergency_guardrails_both_endpoints(client, urgent_phrase):
    consult_res = client.post("/api/consult", json={"messages": [urgent_phrase]})
    assert consult_res.status_code == 200
    c_body = consult_res.json()
    assert c_body["urgent"] is True
    assert c_body["followUpRequired"] is False
    assert c_body["specialty"] is None
    assert c_body["doctors"] == []
    assert "115" in c_body["reply"]

    assist_res = client.post("/api/assistant", json={"message": urgent_phrase})
    assert assist_res.status_code == 200
    a_body = assist_res.json()
    assert a_body["urgent"] is True
    assert a_body["doctors"] == []
    assert a_body["usedAI"] is False


@pytest.mark.parametrize(
    "invalid_messages",
    [
        [],
        ["a"],
        ["   x   "],
        ["Valid first message", "b"],
        ["msg1", "msg2", "msg3", "msg4", "msg5"],
        ["x" * 801],
    ],
)
def test_us01_consult_validation_422(client, invalid_messages):
    res = client.post("/api/consult", json={"messages": invalid_messages})
    assert res.status_code == 422


@pytest.mark.parametrize("bad_msg", ["", "a", "x" * 801])
def test_us01_assistant_validation_422(client, bad_msg):
    res = client.post("/api/assistant", json={"message": bad_msg})
    assert res.status_code == 422


def test_us01_specialty_mapping_and_fallback_general(client, monkeypatch):
    catalog = [
        {
            "id": "10000000-0000-4000-8000-000000000002",
            "name": "BS. Trần Hoàng Mai",
            "specialty": "Tim mạch",
            "bio": "Tim mạch",
            "clinicId": "20000000-0000-4000-8000-000000000002",
            "clinicName": "Phòng khám B",
            "clinicAddress": "Bình Thạnh",
            "district": "Bình Thạnh",
        },
        {
            "id": "10000000-0000-4000-8000-000000000003",
            "name": "BS. Lê Quốc Bình",
            "specialty": "Nội tổng quát",
            "bio": "Tổng quát",
            "clinicId": "20000000-0000-4000-8000-000000000001",
            "clinicName": "Phòng khám A",
            "clinicAddress": "Thủ Đức",
            "district": "Thủ Đức",
        },
    ]
    monkeypatch.setattr(
        service,
        "search_doctors",
        lambda specialty=None, district=None, keyword=None: {
            "doctors": [
                d for d in catalog
                if service.doctor_matches(d, specialty or "", district or "", keyword or "")
            ],
            "demoMode": False,
        },
    )
    monkeypatch.setattr(assistant, "search_doctors", service.search_doctors)

    # Unrecognized symptom defaults to Nội tổng quát after follow-up
    res = client.post("/api/consult", json=["Tôi cảm thấy mệt mỏi uể oải", "Khoảng 3 ngày"])
    assert res.status_code == 422  # body must be object {"messages": [...]}

    res_general = client.post(
        "/api/consult",
        json={"messages": ["Tôi cảm thấy mệt mỏi uể oải", "Khoảng 3 ngày"]},
    )
    assert res_general.status_code == 200
    body_gen = res_general.json()
    assert body_gen["followUpRequired"] is False
    assert body_gen["specialty"] == "Nội tổng quát"
    assert len(body_gen["doctors"]) == 1
    assert "không phải chẩn đoán y khoa" in body_gen["reply"].lower()


def test_us01_assistant_ai_extraction_and_error_fallback(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.setattr(
        assistant,
        "search_doctors",
        lambda specialty=None, district=None, keyword=None: {
            "doctors": [
                {
                    "id": "10000000-0000-4000-8000-000000000001",
                    "name": "BS. Nguyễn Minh An",
                    "specialty": "Da liễu",
                    "bio": "",
                    "clinicId": "20000000-0000-4000-8000-000000000001",
                    "clinicName": "Phòng khám A",
                    "clinicAddress": "Thủ Đức",
                    "district": "Thủ Đức",
                }
            ]
            if specialty == "Da liễu"
            else [],
            "demoMode": False,
        },
    )

    # 1. Valid AI tool extraction
    async def fake_ai_success(_msg: str):
        return {"specialty": "Da liễu", "district": "Thủ Đức", "keyword": None}

    monkeypatch.setattr(assistant, "extract_filters_with_ai", fake_ai_success)
    res_ok = client.post("/api/assistant", json={"message": "Tôi bị ngứa da ở Thủ Đức"})
    assert res_ok.status_code == 200
    assert res_ok.json()["usedAI"] is True
    assert res_ok.json()["filters"]["specialty"] == "Da liễu"
    assert len(res_ok.json()["doctors"]) == 1

    # 2. AI failure falls back to conservative_filters with usedAI=False
    async def fake_ai_timeout(_msg: str):
        raise httpx.ConnectTimeout("OpenAI timeout")

    monkeypatch.setattr(assistant, "extract_filters_with_ai", fake_ai_timeout)
    res_fb = client.post("/api/assistant", json={"message": "Bác sĩ da liễu Thủ Đức"})
    assert res_fb.status_code == 200
    assert res_fb.json()["usedAI"] is False
    assert res_fb.json()["filters"]["specialty"] == "Da liễu"
    assert len(res_fb.json()["doctors"]) == 1

    # 3. Empty result message
    res_empty = client.post("/api/assistant", json={"message": "Khám tim mạch Quận 1"})
    assert res_empty.status_code == 200
    assert res_empty.json()["doctors"] == []
    assert "Không có bác sĩ phù hợp" in res_empty.json()["message"]


# ==============================================================================
# 3. US-02: Doctor Catalog, Pagination, Detail & Slots
# ==============================================================================

def test_us02_catalog_unconfigured_returns_503(client):
    assert client.get("/api/doctors").status_code == 503
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000001").status_code == 503
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000001/slots").status_code == 503


def test_us02_doctor_matches_aliases_and_accents():
    doc = {
        "name": "BS. Đặng Quốc Việt",
        "specialty": "Da liễu",
        "clinicName": "Phòng khám Đa khoa Thủ Đức",
        "district": "Thủ Đức",
    }
    assert service.doctor_matches(doc, specialty="dermatology") is True
    assert service.doctor_matches(doc, specialty="DA LIEU") is True
    assert service.doctor_matches(doc, district="thu duc") is True
    assert service.doctor_matches(doc, keyword="dang quoc viet") is True
    assert service.doctor_matches(doc, specialty="cardiology") is False


def test_us02_search_doctors_scans_multiple_pages_before_limit(monkeypatch):
    # Page 1 has 2 non-matching doctors; Page 2 has 1 matching doctor; Page 3 is empty.
    pages = [
        [
            {
                "id": f"10000000-0000-4000-8000-00000000000{i}",
                "name": f"Doctor {i}",
                "specialty": "Tim mạch",
                "bio": "",
                "clinic_id": "20000000-0000-4000-8000-000000000001",
                "clinics": {"name": "Clinic A", "address": "Addr", "district": "Quận 1", "active": True},
            }
            for i in (1, 2)
        ],
        [
            {
                "id": "10000000-0000-4000-8000-000000000003",
                "name": "BS. Da Liễu",
                "specialty": "Da liễu",
                "bio": "Chuyên khoa da",
                "clinic_id": "20000000-0000-4000-8000-000000000001",
                "clinics": {"name": "Clinic A", "address": "Addr", "district": "Thủ Đức", "active": True},
            }
        ],
        [],
    ]
    call_count = {"idx": 0}

    class PagedQuery:
        def select(self, *_): return self
        def eq(self, *_): return self
        def gt(self, *_): return self
        def order(self, *_): return self
        def limit(self, *_): return self
        def execute(self):
            idx = call_count["idx"]
            call_count["idx"] += 1
            return type("Res", (), {"data": pages[idx]})()

    class PagedClient:
        def table(self, _name):
            return PagedQuery()

    monkeypatch.setattr(service, "get_client", PagedClient)
    result = service.search_doctors(specialty="dermatology")
    assert result["demoMode"] is False
    assert len(result["doctors"]) == 1
    assert result["doctors"][0]["id"] == "10000000-0000-4000-8000-000000000003"
    assert call_count["idx"] == 3


def test_us02_query_length_validation_422(client):
    assert client.get("/api/doctors", params={"specialty": "a" * 81}).status_code == 422
    assert client.get("/api/doctors", params={"district": "b" * 81}).status_code == 422
    assert client.get("/api/doctors", params={"keyword": "c" * 101}).status_code == 422
    assert client.get("/api/doctors/not-a-uuid").status_code == 422
    assert client.get("/api/doctors/not-a-uuid/slots").status_code == 422


# ==============================================================================
# 4. US-02 & Contract v2: Booking Validation, Normalization & Concurrency Errors
# ==============================================================================

@pytest.mark.parametrize(
    "invalid_body",
    [
        # Extra field forbidden by Contract v2 (extra="forbid")
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "0901234567",
            "status": "confirmed",
        },
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "0901234567",
            "doctorId": "10000000-0000-4000-8000-000000000001",
        },
        # Strict type check: phone as integer instead of string
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": 901234567,
        },
        # Phone matches regex length 9-20 with allowed chars, but < 9 ASCII digits
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "+()---()---123",
        },
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "090-123-45",
        },
        # Whitespace-only patientName becomes < 2 chars after strip
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "   A   ",
            "patientPhone": "0901234567",
        },
        # Notes exceeding 500 chars
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "0901234567",
            "notes": "n" * 501,
        },
    ],
)
def test_booking_strict_contract_v2_validation_422(client, invalid_body):
    res = client.post("/api/appointments", json=invalid_body)
    assert res.status_code == 422


def test_booking_unicode_nfc_normalization_and_rpc_ready_guard(client, monkeypatch):
    # Decomposed NFD string "Nguyễn"
    nfd_name = unicodedata.normalize("NFD", "  Nguyễn Văn Demo  ")
    captured_params = {}

    class FakeRPC:
        def execute(self):
            return type("Res", (), {"data": [{
                "appointment_id": "50000000-0000-4000-8000-000000000099",
                "booking_reference": "0123456789AB",
            }]})()

    class FakeTable:
        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def execute(self):
            return type("Res", (), {"data": [{"status": "requested"}]})()

    class FakeClient:
        def rpc(self, name, params):
            captured_params["name"] = name
            captured_params["params"] = params
            return FakeRPC()

        def table(self, _name):
            return FakeTable()

    monkeypatch.setattr(service, "get_client", FakeClient)

    # Without BOOKING_RPC_V2_READY=true -> 503
    res_not_ready = client.post(
        "/api/appointments",
        json={
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": nfd_name,
            "patientPhone": "+84 (90) 123-4567",
        },
    )
    assert res_not_ready.status_code == 503

    # With BOOKING_RPC_V2_READY=true -> 201 and NFC normalized
    monkeypatch.setenv("BOOKING_RPC_V2_READY", "true")
    res_ok = client.post(
        "/api/appointments",
        json={
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": nfd_name,
            "patientPhone": "+84 (90) 123-4567",
        },
    )
    assert res_ok.status_code == 201
    assert captured_params["params"]["p_patient_name"] == unicodedata.normalize("NFC", "Nguyễn Văn Demo")
    body = res_ok.json()
    assert body == {
        "appointmentId": "50000000-0000-4000-8000-000000000099",
        "bookingReference": "0123456789AB",
        "status": "requested",
    }


@pytest.mark.parametrize(
    ("code", "message", "expected_status"),
    [
        ("P0001", "Slot unavailable", 409),
        ("P0001", "Slot already booked", 409),
        ("P0001", "Slot is unavailable", 409),
        ("P0001", "Slot is already booked", 409),
        ("23505", 'duplicate key value violates unique constraint "appointments_one_active_per_slot"', 409),
        ("23505", 'duplicate key value violates unique constraint "appointments_booking_reference_key"', 503),
        ("XX000", "Database internal error", 503),
    ],
)
def test_booking_rpc_database_error_mapping(client, monkeypatch, code, message, expected_status):
    class DbError(Exception):
        def __init__(self, err_code: str, msg: str):
            self.code = err_code
            self.message = msg

    class FailingClient:
        def rpc(self, *_args, **_kwargs):
            raise DbError(code, message)

    monkeypatch.setenv("BOOKING_RPC_V2_READY", "true")
    monkeypatch.setattr(service, "get_client", FailingClient)

    res = client.post(
        "/api/appointments",
        json={
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Demo Patient",
            "patientPhone": "0901234567",
        },
    )
    assert res.status_code == expected_status


# ==============================================================================
# 5. US-03: Staff Auth, Schedule Management & Status Transitions
# ==============================================================================

def test_staff_bearer_token_and_membership_guards(client, monkeypatch):
    # Missing / non-Bearer / empty token -> 401
    for header_val in (None, "Basic dXNlcjpwYXNz", "Bearer   "):
        headers = {"Authorization": header_val} if header_val else {}
        assert client.get("/api/staff/doctors", headers=headers).status_code == 401

    # Valid token but user has no clinic memberships -> 403
    class NoMembershipQuery:
        def select(self, *_): return self
        def eq(self, *_): return self
        def execute(self):
            return type("Res", (), {"data": []})()

    class NoMembershipAuth:
        def get_user(self, _token):
            user = type("User", (), {"id": "90000000-0000-4000-8000-000000000001"})()
            return type("Identity", (), {"user": user})()

    class NoMembershipClient:
        auth = NoMembershipAuth()

        def table(self, _name):
            return NoMembershipQuery()

    monkeypatch.setattr(service, "get_client", NoMembershipClient)
    res = client.get("/api/staff/doctors", headers={"Authorization": "Bearer valid-jwt"})
    assert res.status_code == 403
    assert "No clinic staff access" in res.json()["error"]


@pytest.mark.parametrize(
    ("start_offset", "duration_mins"),
    [
        # Naive datetime (handled in separate test) or past slot
        (timedelta(minutes=-10), 30),
        # Beyond 30 days in future
        (timedelta(days=31), 30),
        # Duration < 15 mins
        (timedelta(days=1), 10),
        # Duration > 120 mins
        (timedelta(days=1), 125),
    ],
)
def test_staff_slot_time_window_and_duration_validation_422(client, start_offset, duration_mins):
    start = datetime.now(timezone.utc) + start_offset
    end = start + timedelta(minutes=duration_mins)
    res = client.post(
        "/api/staff/slots",
        headers={"Authorization": "Bearer token"},
        json={
            "doctorId": "10000000-0000-4000-8000-000000000001",
            "startAt": start.isoformat(),
            "endAt": end.isoformat(),
        },
    )
    assert res.status_code == 422


def test_staff_slot_rejects_naive_timestamps_422(client):
    res = client.post(
        "/api/staff/slots",
        headers={"Authorization": "Bearer token"},
        json={
            "doctorId": "10000000-0000-4000-8000-000000000001",
            "startAt": "2026-11-10T09:00:00",
            "endAt": "2026-11-10T09:30:00",
        },
    )
    assert res.status_code == 422


def test_staff_slot_overlap_returns_409(client, monkeypatch):
    class OverlapError(Exception):
        code = "23P01"

    class FakeTable:
        def __init__(self, name):
            self.name = name

        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def insert(self, *_): return self

        def execute(self):
            if self.name == "doctors":
                return type("Res", (), {"data": [{
                    "id": "10000000-0000-4000-8000-000000000001",
                    "clinic_id": "20000000-0000-4000-8000-000000000001",
                    "active": True,
                }]})()
            raise OverlapError("conflicting key value violates exclusion constraint")

    class FakeClient:
        def table(self, name):
            return FakeTable(name)

    monkeypatch.setattr(
        service,
        "authorized_staff",
        lambda _token: (FakeClient(), ["20000000-0000-4000-8000-000000000001"]),
    )
    start = datetime.now(timezone.utc) + timedelta(days=2)
    res = client.post(
        "/api/staff/slots",
        headers={"Authorization": "Bearer token"},
        json={
            "doctorId": "10000000-0000-4000-8000-000000000001",
            "startAt": start.isoformat(),
            "endAt": (start + timedelta(minutes=30)).isoformat(),
        },
    )
    assert res.status_code == 409
    assert "overlaps" in res.json()["error"].lower()


@pytest.mark.parametrize(
    ("current_status", "target_status", "expected_code"),
    [
        ("requested", "confirmed", 200),
        ("requested", "cancelled", 200),
        ("confirmed", "checked_in", 200),
        ("confirmed", "cancelled", 200),
        ("checked_in", "completed", 200),
        ("checked_in", "cancelled", 200),
        ("requested", "completed", 409),
        ("requested", "checked_in", 409),
        ("confirmed", "completed", 409),
        ("completed", "cancelled", 409),
        ("cancelled", "confirmed", 409),
        ("confirmed", "confirmed", 409),
    ],
)
def test_appointment_status_transition_matrix(client, monkeypatch, current_status, target_status, expected_code):
    appt_id = "50000000-0000-4000-8000-000000000001"
    clinic_id = "20000000-0000-4000-8000-000000000001"

    class FakeApptTable:
        def __init__(self):
            self.is_update = False

        def select(self, *_): return self
        def eq(self, *_): return self
        def single(self): return self

        def update(self, _vals):
            self.is_update = True
            return self

        def execute(self):
            if self.is_update:
                return type("Res", (), {"data": [{"id": appt_id, "status": target_status}]})()
            return type("Res", (), {"data": {
                "id": appt_id,
                "status": current_status,
                "appointment_slots": {"clinic_id": clinic_id},
            }})()

    class FakeClient:
        def table(self, _name):
            return FakeApptTable()

    monkeypatch.setattr(service, "authorized_staff", lambda _tok: (FakeClient(), [clinic_id]))
    res = client.patch(
        f"/api/appointments/{appt_id}",
        headers={"Authorization": "Bearer staff-token"},
        json={"status": target_status},
    )
    assert res.status_code == expected_code
    if expected_code == 200:
        assert res.json() == {"appointment": {"id": appt_id, "status": target_status}}


# ==============================================================================
# 6. End-to-End 6-Step PO Dermatology Acceptance Scenario
# ==============================================================================

def test_e2e_six_step_dermatology_acceptance_scenario(client, monkeypatch):
    """Verifies all 6 steps of docs/ACCEPTANCE_SCENARIO.md against shared stateful mock DB."""
    clinic_id = "20000000-0000-4000-8000-000000000001"
    derm_doctor_id = "10000000-0000-4000-8000-000000000001"
    created_slot_id = "30000000-0000-4000-8000-000000000999"
    created_appt_id = "50000000-0000-4000-8000-000000000999"

    state = {
        "doctors": [
            {
                "id": derm_doctor_id,
                "name": "BS. Nguyễn Minh An (Demo)",
                "specialty": "Da liễu",
                "bio": "Khám và tư vấn các vấn đề về da.",
                "clinic_id": clinic_id,
                "active": True,
                "clinics": {
                    "name": "Phòng khám Mẫu A",
                    "address": "Thủ Đức, TP.HCM",
                    "district": "Thủ Đức",
                    "active": True,
                },
            }
        ],
        "slots": [],
        "appointments": [],
    }

    class StatefulQuery:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self.eq_filters: dict[str, object] = {}
            self.gt_id: str | None = None
            self.insert_payload: dict | None = None
            self.only_unbooked = False

        def select(self, *_): return self
        def in_(self, *_): return self
        def neq(self, *_): return self
        def order(self, *_, **_kw): return self
        def limit(self, *_): return self

        def eq(self, k: str, v: object):
            self.eq_filters[k] = v
            return self

        def gt(self, k: str, v: str):
            if k == "id":
                self.gt_id = v
            return self

        def is_(self, k: str, v: str):
            if k == "appointments" and v == "null":
                self.only_unbooked = True
            return self

        def insert(self, payload: dict):
            self.insert_payload = payload
            return self

        def execute(self):
            if self.table_name == "doctors":
                rows = list(state["doctors"])
                if "id" in self.eq_filters:
                    rows = [r for r in rows if r["id"] == self.eq_filters["id"]]
                if self.gt_id:
                    rows = [r for r in rows if r["id"] > self.gt_id]
                return type("Res", (), {"data": rows})()

            if self.table_name == "appointment_slots":
                if self.insert_payload is not None:
                    new_slot = {
                        "id": created_slot_id,
                        "doctor_id": self.insert_payload["doctor_id"],
                        "clinic_id": self.insert_payload["clinic_id"],
                        "start_at": self.insert_payload["start_at"],
                        "end_at": self.insert_payload["end_at"],
                        "is_published": True,
                        "rooms": None,
                    }
                    state["slots"].append(new_slot)
                    return type("Res", (), {"data": [new_slot]})()

                rows = []
                for s in state["slots"]:
                    if "doctor_id" in self.eq_filters and s["doctor_id"] != self.eq_filters["doctor_id"]:
                        continue
                    slot_appts = [a for a in state["appointments"] if a["slot_id"] == s["id"]]
                    if self.only_unbooked and any(a["status"] != "cancelled" for a in slot_appts):
                        continue
                    rows.append({**s, "appointments": slot_appts})
                return type("Res", (), {"data": rows})()

            if self.table_name == "appointments":
                rows = list(state["appointments"])
                if "id" in self.eq_filters:
                    rows = [r for r in rows if r["id"] == self.eq_filters["id"]]
                return type("Res", (), {"data": rows})()

            return type("Res", (), {"data": []})()

    class StatefulRPC:
        def __init__(self, params: dict):
            self.params = params

        def execute(self):
            slot_id = self.params["p_slot_id"]
            if any(a["slot_id"] == slot_id and a["status"] != "cancelled" for a in state["appointments"]):
                err = Exception("Slot already booked")
                err.code = "P0001"
                err.message = "Slot already booked"
                raise err
            slot = next(s for s in state["slots"] if s["id"] == slot_id)
            doc = next(d for d in state["doctors"] if d["id"] == slot["doctor_id"])
            appt = {
                "id": created_appt_id,
                "slot_id": slot_id,
                "patient_name": self.params["p_patient_name"],
                "patient_phone": self.params["p_patient_phone"],
                "status": "requested",
                "booking_reference": "ABCDEF123456",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "appointment_slots": {
                    "clinic_id": slot["clinic_id"],
                    "start_at": slot["start_at"],
                    "doctors": {"name": doc["name"]},
                    "clinics": {"name": doc["clinics"]["name"]},
                },
            }
            state["appointments"].append(appt)
            return type("Res", (), {"data": [{
                "appointment_id": created_appt_id,
                "booking_reference": "ABCDEF123456",
            }]})()

    class StatefulClient:
        def table(self, name: str):
            return StatefulQuery(name)

        def rpc(self, name: str, params: dict):
            assert name == "create_appointment"
            return StatefulRPC(params)

    monkeypatch.setenv("BOOKING_RPC_V2_READY", "true")
    monkeypatch.setattr(service, "get_client", StatefulClient)
    monkeypatch.setattr(service, "authorized_staff", lambda _tok: (StatefulClient(), [clinic_id]))
    auth_headers = {"Authorization": "Bearer staff-demo-jwt"}

    # STEP 1: Clinic staff selects dermatologist and creates a future slot
    staff_docs = client.get("/api/staff/doctors", headers=auth_headers).json()["doctors"]
    assert len(staff_docs) == 1
    assert staff_docs[0]["id"] == derm_doctor_id

    future_start = datetime.now(timezone.utc) + timedelta(days=2)
    future_end = future_start + timedelta(minutes=30)
    create_slot_res = client.post(
        "/api/staff/slots",
        headers=auth_headers,
        json={
            "doctorId": derm_doctor_id,
            "startAt": future_start.isoformat(),
            "endAt": future_end.isoformat(),
        },
    )
    assert create_slot_res.status_code == 201
    assert create_slot_res.json()["slot"]["available"] is True

    # STEP 2: Patient describes skin-rash symptom -> follow-up -> Dermatology suggested
    turn1 = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa"]}).json()
    assert turn1["followUpRequired"] is True
    assert turn1["specialty"] is None

    turn2 = client.post(
        "/api/consult",
        json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa", "Bắt đầu từ 2 ngày trước"]},
    ).json()
    assert turn2["followUpRequired"] is False
    assert turn2["specialty"] == "Da liễu"
    assert len(turn2["doctors"]) == 1
    assert turn2["doctors"][0]["id"] == derm_doctor_id

    # STEP 3: Patient views matching dermatologist and available slot from Step 1
    patient_slots = client.get(f"/api/doctors/{derm_doctor_id}/slots").json()["slots"]
    assert len(patient_slots) == 1
    assert patient_slots[0]["id"] == created_slot_id

    # STEP 4: Patient selects slot, enters name/phone and confirms booking
    book_res = client.post(
        "/api/appointments",
        json={
            "slotId": created_slot_id,
            "patientName": "Trần Thị Minh (Demo)",
            "patientPhone": "0912345678",
            "notes": "Khám da liễu lần đầu",
        },
    )
    assert book_res.status_code == 201
    assert book_res.json()["appointmentId"] == created_appt_id
    assert book_res.json()["bookingReference"] == "ABCDEF123456"

    # STEP 5: Patient refreshes slots -> booked slot no longer available; duplicate booking returns 409
    refreshed_slots = client.get(f"/api/doctors/{derm_doctor_id}/slots").json()["slots"]
    assert refreshed_slots == []

    duplicate_res = client.post(
        "/api/appointments",
        json={
            "slotId": created_slot_id,
            "patientName": "Bệnh Nhân Thứ Hai",
            "patientPhone": "0987654321",
        },
    )
    assert duplicate_res.status_code == 409

    # STEP 6: Clinic staff refreshes slot list & appointments list -> sees booked slot & patient details
    staff_slots = client.get("/api/staff/slots", headers=auth_headers).json()["slots"]
    assert len(staff_slots) == 1
    assert staff_slots[0]["id"] == created_slot_id
    assert staff_slots[0]["available"] is False

    staff_appts = client.get("/api/staff/appointments", headers=auth_headers).json()["appointments"]
    assert len(staff_appts) == 1
    assert staff_appts[0]["patientName"] == "Trần Thị Minh (Demo)"
    assert staff_appts[0]["patientPhone"] == "0912345678"
    assert staff_appts[0]["doctorName"] == "BS. Nguyễn Minh An (Demo)"
