"""Supabase-backed catalog and booking operations.

Only the backend holds the service-role key. Never send complete Supabase rows
to the browser: explicitly map public doctor/slot fields.
"""
import os
import unicodedata
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from typing import Any

from app.config import is_database_configured
from app.demo import DEMO_DOCTORS, demo_slots
from app.schemas import (
    ALLOWED_TRANSITIONS, BookingInput, BookingResponse, DoctorAppointment, DoctorAppointmentStatusInput,
    DoctorAppointmentStatusResult, DoctorProfile, DoctorSlot, DoctorSlotInput, StaffSlotInput,
)


def get_client() -> Any:
    if not is_database_configured():
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _normalize(value: str) -> str:
    return "".join(
        "d" if char in ("đ", "Đ") else char
        for char in unicodedata.normalize("NFD", value.lower())
        if unicodedata.category(char) != "Mn"
    ).strip()


def _one(value: object) -> dict:
    if isinstance(value, list):
        return value[0] if value else {}
    return value if isinstance(value, dict) else {}


def _doctor_from_record(row: dict) -> dict:
    clinic = _one(row.get("clinics"))
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "specialty": row["specialty"],
        "bio": row.get("bio", ""),
        "clinicId": str(row["clinic_id"]),
        "clinicName": clinic.get("name", ""),
        "clinicAddress": clinic.get("address", ""),
        "district": clinic.get("district", ""),
    }


def _active_doctors_query(client: Any) -> Any:
    return (
        client.table("doctors")
        .select("id,name,specialty,bio,clinic_id,clinics!inner(name,address,district,active)")
        .eq("active", True)
        .eq("clinics.active", True)
    )


def _require_active_doctor(client: Any, doctor_id: UUID) -> dict:
    rows = _active_doctors_query(client).eq("id", str(doctor_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Doctor not found")
    return rows[0]


ALIASES = {
    "dermatology": "Da liễu",
    "cardiology": "Tim mạch",
    "general medicine": "Nội tổng quát",
    "general": "Nội tổng quát",
}


def doctor_matches(doctor: dict, specialty: str = "", district: str = "", keyword: str = "") -> bool:
    specialty = specialty.strip()
    mapped_specialty = ALIASES.get(specialty.lower(), specialty)
    if mapped_specialty and _normalize(mapped_specialty) not in _normalize(doctor["specialty"]):
        return False
    if district and _normalize(district) not in _normalize(doctor["district"]):
        return False
    if keyword:
        haystack = [doctor["name"], doctor["specialty"], doctor["clinicName"], doctor["district"]]
        if not any(_normalize(keyword) in _normalize(value) for value in haystack):
            return False
    return True


def search_doctors(
    specialty: str | None = None,
    district: str | None = None,
    keyword: str | None = None,
) -> dict:
    """Filter the active v1 catalog before limiting the public result to 100.

    Scan ordered pages because accent-insensitive matching is implemented in
    Python, without requiring a schema change from the database owner.
    """
    if not is_database_configured():
        matches = [
            doctor
            for doctor in DEMO_DOCTORS
            if doctor_matches(doctor, specialty or "", district or "", keyword or "")
        ]
        return {"doctors": matches, "demoMode": True}

    matches = []
    last_id = None
    try:
        client = get_client()
        while len(matches) < 100:
            query = _active_doctors_query(client)
            if last_id is not None:
                query = query.gt("id", last_id)
            rows = query.order("id").limit(100).execute().data
            if not rows:
                break
            # Supabase can return fewer rows than requested on any page.
            last_id = rows[-1]["id"]
            for record in rows:
                doctor = _doctor_from_record(record)
                if doctor_matches(doctor, specialty or "", district or "", keyword or ""):
                    matches.append(doctor)
                    if len(matches) == 100:
                        break
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor catalog unavailable") from exc
    return {"doctors": matches, "demoMode": False}


def get_doctor(doctor_id: UUID) -> dict:
    if not is_database_configured():
        doctor = next((item for item in DEMO_DOCTORS if item["id"] == str(doctor_id)), None)
        if doctor is None:
            raise HTTPException(404, "Doctor not found")
        return {"doctor": doctor, "demoMode": True}

    try:
        doctor = _require_active_doctor(get_client(), doctor_id)
        return {"doctor": _doctor_from_record(doctor), "demoMode": False}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor catalog unavailable") from exc


def get_slots(doctor_id: UUID) -> dict:
    if not is_database_configured():
        return {"slots": demo_slots(doctor_id), "demoMode": True}

    try:
        client = get_client()
        doctor = _require_active_doctor(client, doctor_id)
        # The empty embed filters out slots with non-cancelled bookings before LIMIT.
        rows = (
            client
            .table("appointment_slots")
            .select("id,doctor_id,clinic_id,start_at,end_at,rooms(name),appointments()")
            .eq("doctor_id", str(doctor_id))
            .eq("clinic_id", str(doctor["clinic_id"]))
            .eq("is_published", True)
            .gt("start_at", datetime.now(timezone.utc).isoformat())
            .neq("appointments.status", "cancelled")
            .is_("appointments", "null")
            .order("start_at")
            .limit(100)
            .execute()
            .data
        )
        slots = []
        for item in rows:
            room = _one(item.get("rooms"))
            slots.append(
                {
                    "id": str(item["id"]),
                    "doctorId": str(item["doctor_id"]),
                    "clinicId": str(item["clinic_id"]),
                    "startAt": item["start_at"],
                    "endAt": item["end_at"],
                    "roomName": room.get("name"),
                }
            )
        return {"slots": slots, "demoMode": False}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Slots unavailable") from exc


def create_booking(payload: BookingInput) -> dict:
    try:
        client = get_client()
        # The V1 and V2 RPCs have the same signature, but V1 can write a confirmed booking.
        if os.getenv("BOOKING_RPC_V2_READY") != "true":
            raise HTTPException(503, "Booking V2 is not ready")
        response = (
            client.rpc(
                "create_appointment",
                {
                    "p_slot_id": str(payload.slotId),
                    "p_patient_name": payload.patientName,
                    "p_patient_phone": payload.patientPhone,
                    "p_notes": payload.notes,
                },
            )
            .execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", "") or ""
        slot_rejected = code == "P0001" and message in (
            "Slot unavailable", "Slot already booked", "Slot is unavailable", "Slot is already booked",
        )
        slot_conflict = code == "23505" and '"appointments_one_active_per_slot"' in message
        if slot_rejected or slot_conflict:
            raise HTTPException(409, "Slot is no longer available") from exc
        raise HTTPException(503, "Booking service unavailable") from exc

    try:
        (record,) = response.data
        # The RPC result has no status. Verify the stored status before returning 201.
        rows = (
            client.table("appointments")
            .select("status")
            .eq("id", record["appointment_id"])
            .limit(1)
            .execute()
            .data
        )
        booking = BookingResponse(
            appointmentId=record["appointment_id"],
            bookingReference=record["booking_reference"],
            status=rows[0]["status"],
        )
    except Exception as exc:
        raise HTTPException(503, "Booking result unavailable") from exc

    return booking.model_dump(mode="json")


def _authorized_doctor(token: str) -> tuple[Any, str, DoctorProfile]:
    try:
        client = get_client()
        identity = client.auth.get_user(token)
    except HTTPException:
        raise
    except Exception as exc:
        status = getattr(exc, "status", None)
        code = getattr(exc, "code", None)
        message = (getattr(exc, "message", "") or "").strip().casefold()
        api_key_rejected = code == "invalid_api_key" or message.startswith(
            ("invalid api key", "no api key found in request")
        )
        invalid_session = status in (401, 403) or code in (
            "bad_jwt", "invalid_jwt", "session_not_found", "user_not_found",
        )
        if invalid_session and not api_key_rejected:
            raise HTTPException(401, "Invalid doctor session") from exc
        raise HTTPException(503, "Doctor authentication unavailable") from exc

    if identity is None or identity.user is None:
        raise HTTPException(401, "Invalid doctor session")
    user_id = str(identity.user.id)

    try:
        rows = (
            client.table("doctors")
            .select("id,name,specialty,active")
            .eq("auth_user_id", user_id)
            .limit(2)
            .execute()
            .data
        )
        if not rows:
            raise HTTPException(403, "Doctor access denied")
        (row,) = rows
        doctor = DoctorProfile.model_validate(row)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor profile unavailable") from exc
    return client, user_id, doctor


def get_doctor_profile(token: str) -> dict:
    _, _, doctor = _authorized_doctor(token)
    return {"doctor": doctor.model_dump(mode="json")}


def list_doctor_appointments(token: str) -> dict:
    client, user_id, doctor = _authorized_doctor(token)
    try:
        rows = (
            client.table("appointments")
            .select(
                "id,slot_id,patient_name,patient_phone,status,"
                "appointment_slots!inner(doctor_id,start_at,doctors!inner(name))"
            )
            .eq("appointment_slots.doctor_id", str(doctor.id))
            .eq("appointment_slots.doctors.auth_user_id", user_id)
            .in_("status", ["confirmed", "checked_in", "completed", "cancelled"])
            .order("created_at", desc=True)
            .order("id", desc=True)
            .limit(100)
            .execute()
            .data
        )
        appointments = []
        for row in rows:
            slot = _one(row["appointment_slots"])
            appointment = DoctorAppointment(
                id=row["id"],
                slotId=row["slot_id"],
                doctorId=slot["doctor_id"],
                doctorName=_one(slot["doctors"])["name"],
                patientName=row["patient_name"],
                patientPhone=row["patient_phone"],
                startAt=slot["start_at"],
                status=row["status"],
            )
            appointments.append(appointment.model_dump(mode="json"))
    except Exception as exc:
        raise HTTPException(503, "Doctor appointments unavailable") from exc
    return {"appointments": appointments}


def update_doctor_appointment_status(
    appointment_id: UUID, payload: DoctorAppointmentStatusInput, token: str,
) -> dict:
    client, user_id, doctor = _authorized_doctor(token)
    try:
        rows = (
            client.table("appointments")
            .select("status,appointment_slots!inner(doctor_id,doctors!inner(auth_user_id))")
            .eq("id", str(appointment_id))
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise HTTPException(404, "Appointment not found")
        (row,) = rows
        slot = _one(row["appointment_slots"])
        owner = _one(slot["doctors"])
        if str(slot["doctor_id"]) != str(doctor.id) or owner["auth_user_id"] != user_id:
            raise HTTPException(403, "Doctor access denied")
        current = row["status"]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor appointment status unavailable") from exc

    if current not in ("confirmed", "checked_in") or payload.status not in ALLOWED_TRANSITIONS[current]:
        raise HTTPException(409, "Invalid appointment status transition")

    try:
        # The RPC must recheck ownership and compare the expected status in the write transaction.
        (result,) = client.rpc(
            "update_doctor_appointment_status",
            {
                "p_appointment_id": str(appointment_id),
                "p_user_id": user_id,
                "p_expected_status": current,
                "p_status": payload.status,
            },
        ).execute().data
        appointment = DoctorAppointmentStatusResult.model_validate(result)
        if appointment.id != appointment_id or appointment.status != payload.status:
            raise ValueError("Status RPC returned a different appointment or status")
    except Exception as exc:
        code = getattr(exc, "code", None)
        if code == "PT403":
            raise HTTPException(403, "Doctor access denied") from exc
        if code == "PT404":
            raise HTTPException(404, "Appointment not found") from exc
        if code == "PT409":
            raise HTTPException(409, "Appointment status changed or transition is invalid") from exc
        raise HTTPException(503, "Doctor appointment status unavailable") from exc
    return {"appointment": appointment.model_dump(mode="json")}


def _doctor_slot_from_record(row: dict, *, available: bool) -> DoctorSlot:
    return DoctorSlot(
        id=row["id"],
        doctorId=row["doctor_id"],
        startAt=row["start_at"],
        endAt=row["end_at"],
        isPublished=row["is_published"],
        available=available,
    )


def list_doctor_slots(token: str) -> dict:
    client, user_id, doctor = _authorized_doctor(token)
    try:
        rows = (
            client.table("appointment_slots")
            .select("id,doctor_id,start_at,end_at,is_published,doctors!inner(active),appointments(status)")
            .eq("doctor_id", str(doctor.id))
            .eq("doctors.auth_user_id", user_id)
            .gt("start_at", datetime.now(timezone.utc).isoformat())
            .neq("appointments.status", "cancelled")
            .order("start_at")
            .order("id")
            .limit(100)
            .execute()
            .data
        )
        slots = [
            _doctor_slot_from_record(
                row,
                available=_one(row["doctors"])["active"] and row["is_published"] and not row["appointments"],
            ).model_dump(mode="json")
            for row in rows
        ]
    except Exception as exc:
        raise HTTPException(503, "Doctor slots unavailable") from exc
    return {"slots": slots}


def create_doctor_slot(payload: DoctorSlotInput, token: str) -> dict:
    client, user_id, doctor = _authorized_doctor(token)
    if not doctor.active:
        raise HTTPException(409, "Doctor is not accepting new slots")
    try:
        # The RPC resolves ownership and rechecks the slot in the write transaction.
        (row,) = client.rpc(
            "create_doctor_slot",
            {
                "p_user_id": user_id,
                "p_start_at": payload.startAt.isoformat(),
                "p_end_at": payload.endAt.isoformat(),
            },
        ).execute().data
        slot = _doctor_slot_from_record(row, available=True)
        if (
            slot.doctorId != doctor.id or not slot.isPublished
            or slot.startAt != payload.startAt or slot.endAt != payload.endAt
        ):
            raise ValueError("Slot RPC returned a different slot")
    except Exception as exc:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", "") or ""
        if code == "PT403":
            raise HTTPException(403, "Doctor access denied") from exc
        overlap = code == "23P01" and '"appointment_slots_no_overlap"' in message
        duplicate_start = code == "23505" and '"appointment_slots_doctor_start_key"' in message
        if code == "PT409" or overlap or duplicate_start:
            raise HTTPException(409, "Doctor slot conflicts with the current schedule") from exc
        if code == "PT422":
            raise RequestValidationError([{
                "loc": ("body",),
                "msg": "Slot must be in the future and exactly 30 minutes",
                "type": "value_error",
            }]) from exc
        raise HTTPException(503, "Doctor slot creation unavailable") from exc
    return {"slot": slot.model_dump(mode="json")}


def authorized_staff(token: str) -> tuple[Any, list[str]]:
    client = get_client()
    try:
        identity = client.auth.get_user(token)
        user = identity.user
        if user is None:
            raise HTTPException(401, "Invalid staff session")
        memberships = (
            client.table("staff_members")
            .select("clinic_id")
            .eq("user_id", user.id)
            .execute()
            .data
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(401, "Invalid staff session") from exc
    clinic_ids = [str(item["clinic_id"]) for item in memberships]
    if not clinic_ids:
        raise HTTPException(403, "No clinic staff access")
    return client, clinic_ids


def list_staff_appointments(token: str) -> dict:
    client, clinic_ids = authorized_staff(token)
    try:
        rows = (
            client.table("appointments")
            .select(
                "id,slot_id,patient_name,patient_phone,status,created_at,"
                "appointment_slots!inner(clinic_id,start_at,doctors(name),clinics(name))"
            )
            .in_("appointment_slots.clinic_id", clinic_ids)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(503, "Cannot load appointments") from exc
    appointments = []
    for item in rows:
        slot = _one(item.get("appointment_slots"))
        doctor = _one(slot.get("doctors"))
        clinic = _one(slot.get("clinics"))
        appointments.append(
            {
                "id": item["id"],
                "patientName": item["patient_name"],
                "patientPhone": item["patient_phone"],
                "status": item["status"],
                "startAt": slot.get("start_at"),
                "doctorName": doctor.get("name", ""),
                "clinicName": clinic.get("name", ""),
            }
        )
    return {"appointments": appointments}


def update_status(appointment_id: UUID, requested: str, token: str) -> dict:
    client, clinic_ids = authorized_staff(token)
    try:
        response = (
            client.table("appointments")
            .select("id,status,appointment_slots!inner(clinic_id)")
            .eq("id", str(appointment_id))
            .single()
            .execute()
        )
        appointment = response.data
    except Exception as exc:
        raise HTTPException(404, "Appointment not found") from exc
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    clinic_id = str(_one(appointment["appointment_slots"]).get("clinic_id"))
    if clinic_id not in clinic_ids:
        raise HTTPException(403, "Not staff of this clinic")
    current = appointment["status"]
    if requested not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(409, "Invalid status transition")
    try:
        result = (
            client.table("appointments")
            .update({"status": requested})
            .eq("id", str(appointment_id))
            .eq("status", current)
            .select("id,status")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(503, "Unable to update appointment") from exc
    if not result.data:
        raise HTTPException(409, "Appointment changed; reload and retry")
    return {"appointment": result.data[0]}



def list_staff_doctors(token: str) -> dict:
    client, clinic_ids = authorized_staff(token)
    try:
        data = (
            client.table("doctors")
            .select("id,name,specialty,clinic_id,clinics!inner(name,address,district)")
            .in_("clinic_id", clinic_ids).eq("active", True)
            .order("name").execute().data
        )
    except Exception as exc:
        raise HTTPException(503, "Cannot load staff doctors") from exc
    return {"doctors": [_doctor_from_record(record) for record in data]}


def list_staff_slots(token: str, doctor_id: UUID | None = None) -> dict:
    client, clinic_ids = authorized_staff(token)
    try:
        query = (
            client.table("appointment_slots")
            .select("id,doctor_id,clinic_id,start_at,end_at,appointments(status)")
            .in_("clinic_id", clinic_ids).gt("start_at", datetime.now(timezone.utc).isoformat())
            .order("start_at").limit(100)
        )
        if doctor_id:
            query = query.eq("doctor_id", str(doctor_id))
        rows = query.execute().data
    except Exception as exc:
        raise HTTPException(503, "Cannot load clinic schedule") from exc
    return {"slots": [
        {
            "id": row["id"], "doctorId": row["doctor_id"], "clinicId": row["clinic_id"],
            "startAt": row["start_at"], "endAt": row["end_at"],
            "available": not any(a["status"] != "cancelled" for a in row.get("appointments", [])),
        }
        for row in rows
    ]}


def create_staff_slot(payload: StaffSlotInput, token: str) -> dict:

    client, clinic_ids = authorized_staff(token)
    try:
        doctors = (
            client.table("doctors").select("id,clinic_id,active")
            .eq("id", str(payload.doctorId)).limit(1).execute().data
        )
    except Exception as exc:
        raise HTTPException(503, "Cannot validate doctor") from exc
    if not doctors or not doctors[0]["active"] or str(doctors[0]["clinic_id"]) not in clinic_ids:
        raise HTTPException(403, "Doctor is not in an authorized clinic")
    clinic_id = str(doctors[0]["clinic_id"])
    try:
        response = (
            client.table("appointment_slots").insert({
                "doctor_id": str(payload.doctorId),
                "clinic_id": clinic_id,
                "room_id": None,
                "start_at": payload.startAt.isoformat(),
                "end_at": payload.endAt.isoformat(),
                "is_published": True,
            }).execute()
        )
    except Exception as exc:
        if getattr(exc, "code", None) in ("23505", "23P01"):
            raise HTTPException(409, "Doctor slot overlaps an existing time slot") from exc
        raise HTTPException(503, "Cannot create clinic slot") from exc
    if not response.data:
        raise HTTPException(503, "Slot not saved")
    slot = response.data[0]
    return {
        "slot": {
            "id": slot["id"], "doctorId": slot["doctor_id"],
            "clinicId": slot["clinic_id"], "startAt": slot["start_at"],
            "endAt": slot["end_at"], "available": True,
        }
    }
