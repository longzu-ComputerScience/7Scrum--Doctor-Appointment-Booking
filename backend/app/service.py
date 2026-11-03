"""Supabase-backed catalog and booking operations.

Only the backend holds the service-role key. Never send complete Supabase rows
to the browser: explicitly map public doctor/slot fields.
"""
import os
import unicodedata
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from typing import Any

from app.config import is_database_configured
from app.demo import DEMO_DOCTORS, demo_slots
from app.schemas import ALLOWED_TRANSITIONS, BookingInput


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


ALIASES = {
    "dermatology": "Da liễu",
    "cardiology": "Tim mạch",
    "general medicine": "Nội tổng quát",
    "general": "Nội tổng quát",
}


def doctor_matches(doctor: dict, specialty: str = "", district: str = "", keyword: str = "") -> bool:
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
    if not is_database_configured():
        doctors = DEMO_DOCTORS
        demo_mode = True
    else:
        try:
            result = (
                get_client()
                .table("doctors")
                .select("id,name,specialty,bio,clinic_id,clinics!inner(name,address,district,active)")
                .eq("active", True)
                .eq("clinics.active", True)
                .limit(100)
                .execute()
            )
            doctors = [_doctor_from_record(record) for record in result.data]
        except Exception as exc:
            raise HTTPException(503, "Doctor catalog unavailable") from exc
        demo_mode = False
    matches = [
        doctor
        for doctor in doctors
        if doctor_matches(doctor, specialty or "", district or "", keyword or "")
    ]
    return {"doctors": matches, "demoMode": demo_mode}


def get_doctor(doctor_id: UUID) -> dict:
    result = search_doctors()
    doctor = next((d for d in result["doctors"] if d["id"] == str(doctor_id)), None)
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    return {"doctor": doctor, "demoMode": result["demoMode"]}


def get_slots(doctor_id: UUID) -> dict:
    if not is_database_configured():
        return {"slots": demo_slots(doctor_id), "demoMode": True}
    try:
        rows = (
            get_client()
            .table("appointment_slots")
            .select("id,doctor_id,clinic_id,start_at,end_at,rooms(name),appointments(status)")
            .eq("doctor_id", str(doctor_id))
            .eq("is_published", True)
            .gt("start_at", datetime.now(timezone.utc).isoformat())
            .order("start_at")
            .limit(100)
            .execute()
            .data
        )
        slots = []
        for item in rows:
            if any(booking["status"] != "cancelled" for booking in item.get("appointments", [])):
                continue
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
    except Exception as exc:
        raise HTTPException(503, "Slots unavailable") from exc


def create_booking(payload: BookingInput) -> dict:
    client = get_client()
    try:
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
    except Exception as exc:
        # PostgreSQL RPC raises P0001 for missing, already reserved or stale slots.
        if getattr(exc, "code", None) in ("P0001", "23505"):
            raise HTTPException(409, "Slot is no longer available") from exc
        raise HTTPException(503, "Booking service unavailable") from exc

    value = response.data
    record = value[0] if isinstance(value, list) and value else value
    if not isinstance(record, dict) or not record.get("appointment_id"):
        raise HTTPException(409, "Slot is no longer available")
    return {
        "appointmentId": record["appointment_id"],
        "bookingReference": record["booking_reference"],
        "status": "requested",
    }


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
