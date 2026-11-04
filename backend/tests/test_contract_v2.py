"""Automated test suite mapped to FR-01..FR-11, Status Transition Matrix, and NFR-01..NFR-07.

Traceability:
- US-01: Patient Symptom Consultation & Specialty Recommendation
  - FR-01: Symptom Input & Conversation (AC01..AC04)
  - FR-02: Specialty Recommendation (AC01..AC03)
  - FR-03: Doctor Navigation (AC01..AC03)
  - FR-04: Emergency Handling & Fallback (AC01..AC04)
- US-02: Doctor Discovery & Appointment Booking
  - FR-05: Doctor Listing & Specialty Filtering (AC01..AC04)
  - FR-06: Doctor Profile (AC01..AC05)
  - FR-07: Appointment Availability (AC01..AC05)
  - FR-08: Patient Information & Booking Submission (AC01..AC05)
  - FR-09: Booking Persistence & Double-booking Prevention (AC01..AC04)
  - FR-10: Booking Result & Confirmation - initial status 'requested' (AC01..AC04)
  - FR-11: Booking Error Handling (AC01..AC04)
- API v2 Status Transitions (requested -> confirmed -> checked_in -> completed / cancelled)
- Shared NFRs: NFR-01..NFR-07
"""
from datetime import datetime, timedelta, timezone
import unicodedata

from fastapi.testclient import TestClient
import httpx
import pytest

from app import assistant, config, main, service
from tests.test_api import FakeCatalogClient


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "BOOKING_RPC_V2_READY", "CORS_ORIGINS"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(service, "get_client", lambda: FakeCatalogClient())


@pytest.fixture()
def configure_db_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-service-role-key")


@pytest.fixture()
def client():
    return TestClient(main.app)


# ==============================================================================
# US-01 — FR-01: Symptom Input & Conversation (AC01..AC04)
# ==============================================================================

def test_fr01_two_turn_symptom_conversation(client):
    # AC01, AC02, AC03: First turn with valid symptom returns follow-up question
    turn1 = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa ở tay"]})
    assert turn1.status_code == 200
    body1 = turn1.json()
    assert body1["followUpRequired"] is True
    assert body1["specialty"] is None
    assert body1["doctors"] == []
    assert len(body1["reply"]) > 10

    # AC04: Patient answers follow-up question in second turn
    turn2 = client.post(
        "/api/consult",
        json=["Tôi bị nổi mẩn đỏ và ngứa ở tay", "Khoảng 2 ngày nay"],
    )
    assert turn2.status_code == 422  # Must wrap in {"messages": [...]}

    turn2_valid = client.post(
        "/api/consult",
        json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa ở tay", "Khoảng 2 ngày nay"]},
    )
    assert turn2_valid.status_code == 200
    body2 = turn2_valid.json()
    assert body2["followUpRequired"] is False


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
def test_fr01_message_bounds_validation_422(client, invalid_messages):
    res = client.post("/api/consult", json={"messages": invalid_messages})
    assert res.status_code == 422


# ==============================================================================
# US-01 — FR-02: Specialty Recommendation (AC01..AC03)
# ==============================================================================

@pytest.mark.parametrize(
    ("symptom_msg", "expected_specialty"),
    [
        ("Tôi bị nổi mẩn đỏ trên mặt", "Da liễu"),
        ("Da mặt nổi nhiều mụn viêm", "Da liễu"),
        ("Tôi muốn khám tim mạch kiểm tra huyết áp", "Tim mạch"),
        ("Gần đây tôi thấy mệt mỏi uể oải", "Nội tổng quát"),
    ],
)
def test_fr02_specialty_recommendation_and_no_diagnosis(client, symptom_msg, expected_specialty):
    res = client.post(
        "/api/consult",
        json={"messages": [symptom_msg, "Tình trạng kéo dài khoảng 3 ngày"]},
    )
    assert res.status_code == 200
    body = res.json()
    # AC01, AC02: Returns and highlights matching specialty
    assert body["followUpRequired"] is False
    assert body["specialty"] == expected_specialty
    # AC03: Explicitly states it is not a medical diagnosis
    assert "không phải chẩn đoán y khoa" in body["reply"].lower()


# ==============================================================================
# US-01 — FR-03: Doctor Navigation (AC01..AC03)
# ==============================================================================

def test_fr03_doctor_navigation_filtered_by_recommended_specialty(client):
    res = client.post(
        "/api/consult",
        json={"messages": ["Tôi bị nổi mẩn đỏ", "Khoảng 2 ngày"]},
    )
    assert res.status_code == 200
    body = res.json()
    # AC01, AC02: Doctors returned match the recommended specialty from real/demo catalog
    assert body["specialty"] == "Da liễu"
    assert len(body["doctors"]) == 1
    assert body["doctors"][0]["specialty"] == "Da liễu"
    assert "Nguyễn Minh An" in body["doctors"][0]["name"]


# ==============================================================================
# US-01 — FR-04: Emergency Handling & Fallback (AC01..AC04)
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
def test_fr04_ac01_ac02_emergency_guardrails(client, urgent_phrase):
    # Check /api/consult
    consult_res = client.post("/api/consult", json={"messages": [urgent_phrase]})
    assert consult_res.status_code == 200
    c_body = consult_res.json()
    assert c_body["urgent"] is True
    assert c_body["followUpRequired"] is False
    assert c_body["specialty"] is None
    assert c_body["doctors"] == []
    assert "115" in c_body["reply"]

    # Check /api/assistant
    assist_res = client.post("/api/assistant", json={"message": urgent_phrase})
    assert assist_res.status_code == 200
    a_body = assist_res.json()
    assert a_body["urgent"] is True
    assert a_body["doctors"] == []
    assert a_body["usedAI"] is False


def test_fr04_ac03_ac04_ai_vs_fallback_distinction(client, monkeypatch):
    # AC03, AC04: When AI is configured and succeeds -> usedAI=True
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")

    async def fake_ai_success(_msg: str):
        return {"specialty": "Da liễu", "district": "Thủ Đức", "keyword": None}

    monkeypatch.setattr(assistant, "extract_filters_with_ai", fake_ai_success)
    res_ai = client.post("/api/assistant", json={"message": "Tôi bị ngứa da ở Thủ Đức"})
    assert res_ai.status_code == 200
    assert res_ai.json()["usedAI"] is True
    assert len(res_ai.json()["doctors"]) == 1

    # AC03, AC04: When AI times out or errors -> graceful fallback with usedAI=False
    async def fake_ai_timeout(_msg: str):
        raise httpx.ConnectTimeout("OpenAI timeout")

    monkeypatch.setattr(assistant, "extract_filters_with_ai", fake_ai_timeout)
    res_fb = client.post("/api/assistant", json={"message": "Tìm bác sĩ da liễu Thủ Đức"})
    assert res_fb.status_code == 200
    assert res_fb.json()["usedAI"] is False
    assert len(res_fb.json()["doctors"]) == 1


# ==============================================================================
# US-02 — FR-05, FR-06, FR-07: Doctor Listing, Profile & Availability
# ==============================================================================

def test_fr05_doctor_listing_filtering_and_empty_state(client):
    # AC01, AC03: Active doctors with name and specialty
    all_docs = client.get("/api/doctors").json()
    assert len(all_docs["doctors"]) == 3
    for doc in all_docs["doctors"]:
        assert doc["name"]
        assert doc["specialty"]

    # AC02: Specialty filtering (accent-insensitive & English aliases)
    for query_spec in ("Da liễu", "da lieu", "dermatology"):
        filtered = client.get("/api/doctors", params={"specialty": query_spec}).json()
        assert len(filtered["doctors"]) == 1
        assert filtered["doctors"][0]["specialty"] == "Da liễu"

    # AC04: Empty state when no doctors match (never fabricates fake records)
    empty = client.get("/api/doctors", params={"specialty": "Ngoại Thần Kinh"}).json()
    assert empty["doctors"] == []


def test_fr05_pagination_scans_multiple_pages_before_limit(monkeypatch, configure_db_env):
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


def test_fr06_doctor_profile_and_404(client):
    doc_id = "10000000-0000-4000-8000-000000000001"
    res = client.get(f"/api/doctors/{doc_id}")
    assert res.status_code == 200
    doc = res.json()["doctor"]
    assert doc["id"] == doc_id
    assert doc["name"] == "BS. Nguyễn Minh An (Demo)"
    assert doc["specialty"] == "Da liễu"
    assert doc["district"] == "Thủ Đức"

    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000099").status_code == 404
    assert client.get("/api/doctors/invalid-uuid").status_code == 422


def test_fr07_appointment_availability_sorted_and_future(client):
    doc_id = "10000000-0000-4000-8000-000000000001"
    res = client.get(f"/api/doctors/{doc_id}/slots")
    assert res.status_code == 200
    slots = res.json()["slots"]
    assert len(slots) == 9
    # AC01, AC02: All slots are in the future and ordered by startAt ascending
    starts = [datetime.fromisoformat(s["startAt"]) for s in slots]
    assert starts == sorted(starts)
    assert all(dt > datetime.now(timezone.utc) for dt in starts)


# ==============================================================================
# US-02 — FR-08, FR-09, FR-10, FR-11: Booking Validation, Persistence & Result
# ==============================================================================

@pytest.mark.parametrize(
    "invalid_body",
    [
        # Extra fields forbidden (NFR-05 / Contract v2)
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
        # Strict type check: phone as number instead of string
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
        # Whitespace-padded name < 2 chars after strip
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "   A   ",
            "patientPhone": "0901234567",
        },
        # Notes > 500 chars
        {
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": "Nguyễn Văn A",
            "patientPhone": "0901234567",
            "notes": "n" * 501,
        },
    ],
)
def test_fr08_fr11_booking_validation_422(client, invalid_body):
    res = client.post("/api/appointments", json=invalid_body)
    assert res.status_code == 422


def test_fr09_fr10_booking_persistence_and_requested_status(client, monkeypatch):
    """Verifies FR-09 & FR-10: Booking returns bookingReference and initial status 'requested'."""
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

    # FR-11 AC03 / NFR-07: Without BOOKING_RPC_V2_READY=true -> 503
    res_not_ready = client.post(
        "/api/appointments",
        json={
            "slotId": "30000000-0000-4000-8000-000000000109",
            "patientName": nfd_name,
            "patientPhone": "+84 (90) 123-4567",
        },
    )
    assert res_not_ready.status_code == 503

    # FR-10 AC01, AC03, AC04: Returns 201 with 12-char hex bookingReference and status='requested'
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
    assert res_ok.json() == {
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
def test_fr09_fr11_double_booking_and_db_error_mapping(client, monkeypatch, code, message, expected_status):
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
# Status Transition Matrix & Staff Authorization (API v2 & NFR-04..06)
# ==============================================================================

@pytest.mark.parametrize(
    ("current_status", "target_status", "expected_code"),
    [
        # Valid transitions per API v2 table
        ("requested", "confirmed", 200),
        ("requested", "cancelled", 200),
        ("confirmed", "checked_in", 200),
        ("confirmed", "cancelled", 200),
        ("checked_in", "completed", 200),
        ("checked_in", "cancelled", 200),
        # Invalid transitions -> 409 Conflict
        ("requested", "checked_in", 409),
        ("requested", "completed", 409),
        ("confirmed", "completed", 409),
        ("completed", "cancelled", 409),
        ("cancelled", "confirmed", 409),
        ("confirmed", "confirmed", 409),
    ],
)
def test_v2_appointment_status_transition_matrix(client, monkeypatch, current_status, target_status, expected_code):
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


def test_nfr04_nfr05_staff_auth_and_database_errors(client, monkeypatch, configure_db_env):
    monkeypatch.setenv("CORS_ORIGINS", " http://localhost:3000/ , https://app.example.com/ ")
    assert config.allowed_origins() == ["http://localhost:3000", "https://app.example.com"]
    assert client.get("/api/health").json() == {"status": "ok", "databaseConfigured": True}

    # NFR-05: 503 when database is configured but unreachable
    def broken_client():
        raise RuntimeError("Supabase connection refused")

    monkeypatch.setattr(service, "get_client", broken_client)
    assert client.get("/api/doctors").status_code == 503
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000001").status_code == 503
    assert client.get("/api/doctors/10000000-0000-4000-8000-000000000001/slots").status_code == 503


# ==============================================================================
# Full End-to-End Flow: US-01 -> US-02 (status='requested') -> Staff 'confirmed'
# ==============================================================================

def test_e2e_patient_consultation_booking_requested_and_staff_confirmation(client, monkeypatch, configure_db_env):
    """End-to-end test verifying US-01, US-02 (FR-01..FR-11), and Staff confirmation."""
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
            self.update_payload: dict | None = None
            self.only_unbooked = False
            self.is_single = False

        def select(self, *_): return self
        def in_(self, *_): return self
        def neq(self, *_): return self
        def order(self, *_, **_kw): return self
        def limit(self, *_): return self

        def single(self):
            self.is_single = True
            return self

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

        def update(self, payload: dict):
            self.update_payload = payload
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
                if self.update_payload is not None:
                    for a in state["appointments"]:
                        if a["id"] == self.eq_filters.get("id") and a["status"] == self.eq_filters.get("status"):
                            a["status"] = self.update_payload["status"]
                            return type("Res", (), {"data": [{"id": a["id"], "status": a["status"]}]})()
                    return type("Res", (), {"data": []})()

                rows = list(state["appointments"])
                if "id" in self.eq_filters:
                    rows = [r for r in rows if r["id"] == self.eq_filters["id"]]
                if self.is_single:
                    return type("Res", (), {"data": rows[0] if rows else None})()
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

    # 1. Staff creates an available future slot
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

    # 2. US-01: Patient 2-turn symptom consultation -> recommends 'Da liễu'
    turn1 = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa"]}).json()
    assert turn1["followUpRequired"] is True
    turn2 = client.post(
        "/api/consult",
        json={"messages": ["Tôi bị nổi mẩn đỏ và ngứa", "Bắt đầu từ 2 ngày trước"]},
    ).json()
    assert turn2["specialty"] == "Da liễu"
    assert turn2["doctors"][0]["id"] == derm_doctor_id

    # 3. US-02 (FR-07): Patient views available slots for the recommended doctor
    patient_slots = client.get(f"/api/doctors/{derm_doctor_id}/slots").json()["slots"]
    assert len(patient_slots) == 1
    assert patient_slots[0]["id"] == created_slot_id

    # 4. US-02 (FR-08, FR-09, FR-10): Patient books slot -> receives status='requested' ("Chờ xác nhận")
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
    assert book_res.json() == {
        "appointmentId": created_appt_id,
        "bookingReference": "ABCDEF123456",
        "status": "requested",
    }

    # 5. FR-09 & FR-11: Slot is no longer available; concurrent/second booking returns 409
    assert client.get(f"/api/doctors/{derm_doctor_id}/slots").json()["slots"] == []
    dup_res = client.post(
        "/api/appointments",
        json={
            "slotId": created_slot_id,
            "patientName": "Bệnh Nhân Thứ Hai",
            "patientPhone": "0987654321",
        },
    )
    assert dup_res.status_code == 409

    # 6. Staff sees 'requested' appointment and transitions it to 'confirmed' ("Đã xác nhận")
    staff_appts = client.get("/api/staff/appointments", headers=auth_headers).json()["appointments"]
    assert len(staff_appts) == 1
    assert staff_appts[0]["status"] == "requested"

    confirm_res = client.patch(
        f"/api/appointments/{created_appt_id}",
        headers=auth_headers,
        json={"status": "confirmed"},
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json() == {"appointment": {"id": created_appt_id, "status": "confirmed"}}
