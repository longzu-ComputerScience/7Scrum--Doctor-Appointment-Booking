"""Supabase-backed catalog and booking operations.

Only the backend holds the service-role key. Never send complete Supabase rows
to the browser: explicitly map public doctor/slot fields.
"""
import json
import logging
import os
import unicodedata
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

from app.config import is_database_configured
from app.demo import DEMO_DOCTORS, demo_slots
from app.schemas import (
    ALLOWED_TRANSITIONS, AvailableSlot, BookingInput, BookingResponse, Doctor, DoctorAppointment,
    DoctorAppointmentStatusInput,
    DoctorAppointmentStatusResult, DoctorNotification, DoctorProfile, DoctorRegistrationInput, ManualDoctorSlot,
    DoctorSlot, DoctorSlotInput, NotificationReadResult, PatientProfile, PatientRegistrationInput, ScheduleConflict,
    ScheduleInput, ScheduleResponse, StaffSlotInput, WorkingInterval,
)

logger = logging.getLogger(__name__)
SCHEDULE_ZONE = ZoneInfo("Asia/Ho_Chi_Minh")
PAGE_SIZE = 500
RPC_ERRORS = {
    "PT403": (403, "Access denied"),
    "PT404": (404, "Resource not found"),
    "PT409": (409, "Resource conflict"),
    "PT422": (422, "Invalid input"),
}


@contextmanager
def _database_operation(unavailable: str):
    try:
        yield
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, unavailable) from exc


def _rpc_error(exc: Exception, unavailable: str, *, conflict: str = "Resource conflict") -> HTTPException:
    status, message = RPC_ERRORS.get(getattr(exc, "code", None), (503, unavailable))
    return HTTPException(status, conflict if status == 409 else message)


def _ordered_pages(query_factory, column: str):
    last = None
    while True:
        query = query_factory()
        if last is not None:
            query = query.gt(column, last)
        rows = query.order(column).limit(PAGE_SIZE).execute().data
        if not rows:
            return
        yield from rows
        last = rows[-1][column]


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
        .select("id,name,specialty,bio,address,district,certificates,rating,rating_count")
        .eq("active", True)
    )


def _public_doctor(row: dict) -> dict:
    return Doctor(
        id=row["id"], name=row["name"], specialty=row["specialty"], bio=row["bio"],
        address=row["address"], district=row["district"], certificates=row["certificates"],
        rating=row["rating"], ratingCount=row["rating_count"],
    ).model_dump(mode="json")


def _public_demo_doctor(row: dict) -> dict:
    return _public_doctor({
        **row, "address": row.get("address") or row.get("clinicAddress", ""),
        "certificates": [], "rating": None, "rating_count": 0,
    })


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
        haystack = [doctor["name"], doctor["specialty"], doctor["address"], doctor["district"]]
        if not any(_normalize(keyword) in _normalize(value) for value in haystack):
            return False
    return True


def search_doctors(
    specialty: str | None = None,
    district: str | None = None,
    keyword: str | None = None,
) -> dict:
    """Filter the active catalog before limiting the public result to 100.

    Scan ordered pages because accent-insensitive matching is implemented in
    Python, without requiring a schema change from the database owner.
    """
    if not is_database_configured():
        matches = [
            doctor
            for doctor in map(_public_demo_doctor, DEMO_DOCTORS)
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
                doctor = _public_doctor(record)
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
        return {"doctor": _public_demo_doctor(doctor), "demoMode": True}

    try:
        doctor = _require_active_doctor(get_client(), doctor_id)
        return {"doctor": _public_doctor(doctor), "demoMode": False}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor catalog unavailable") from exc


def _today() -> date:
    return datetime.now(SCHEDULE_ZONE).date()


def _availability_range(start: date | None, end: date | None) -> tuple[date, date]:
    today = _today()
    start = start if start is not None else today
    end = end if end is not None else today + timedelta(days=30)
    if not 0 <= (end - start).days <= 30:
        raise HTTPException(422, "Use an ordered range of at most 31 calendar dates")
    return start, end


def _available_slots(client: Any, doctor_id: UUID, start: date, end: date) -> list[AvailableSlot]:
    def query():
        return client.rpc("list_doctor_availability", {
            "p_doctor_id": str(doctor_id), "p_from": start.isoformat(), "p_to": end.isoformat(),
        })

    return [
        AvailableSlot(id=row["slot_id"], doctorId=doctor_id, startAt=row["start_at"], endAt=row["end_at"])
        for row in _ordered_pages(query, "start_at")
    ]


def _is_future_half_hour_slot(slot: AvailableSlot, now: datetime) -> bool:
    return slot.startAt > now and slot.endAt - slot.startAt == timedelta(minutes=30)


def get_slots(doctor_id: UUID, start: date | None, end: date | None) -> dict:
    start, end = _availability_range(start, end)
    demo_mode = not is_database_configured()
    if demo_mode:
        get_doctor(doctor_id)
        slots = [AvailableSlot.model_validate(row) for row in demo_slots(doctor_id)]
    else:
        with _database_operation("Slots unavailable"):
            client = get_client()
            _require_active_doctor(client, doctor_id)
            try:
                slots = _available_slots(client, doctor_id, start, end)
            except Exception as exc:
                raise _rpc_error(exc, "Slots unavailable") from exc
    # A slot can start while the RPC results are being fetched.
    now = datetime.now(timezone.utc)
    return {
        "slots": [
            slot for slot in slots
            if _is_future_half_hour_slot(slot, now)
            and start <= slot.startAt.astimezone(SCHEDULE_ZONE).date() <= end
        ],
        "demoMode": demo_mode,
    }


def create_booking(payload: BookingInput, token: str) -> dict:
    client, user_id, _ = _authenticated_user(token)
    try:
        (record,) = client.rpc("book_recurring_appointment", {
            "p_user_id": user_id, "p_slot_id": str(payload.slotId), "p_notes": payload.notes,
        }).execute().data
        booking = BookingResponse(
            appointmentId=record["appointment_id"],
            bookingReference=record["booking_reference"],
            status=record["status"],
        )
    except Exception as exc:
        raise _rpc_error(exc, "Booking service unavailable", conflict="Slot is no longer available") from exc
    return booking.model_dump(mode="json")


def _authenticated_user(token: str) -> tuple[Any, str, str | None]:
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
            "bad_jwt", "invalid_jwt", "session_not_found", "user_not_found", "unexpected_audience",
        )
        if invalid_session and not api_key_rejected:
            raise HTTPException(401, "Invalid session") from exc
        raise HTTPException(503, "Authentication unavailable") from exc

    if identity is None or identity.user is None:
        raise HTTPException(401, "Invalid session")
    return client, str(identity.user.id), identity.user.email


def _doctor_identity(client: Any, user_id: str) -> DoctorProfile | None:
    try:
        rows = (
            client.table("doctor_accounts")
            .select("doctors!inner(id,name,specialty,active)")
            .eq("auth_user_id", user_id)
            .limit(2)
            .execute()
            .data
        )
        if not rows:
            return None
        (row,) = rows
        doctor = DoctorProfile.model_validate(_one(row["doctors"]))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Doctor profile unavailable") from exc
    return doctor


def _authorized_doctor(token: str) -> tuple[Any, str, DoctorProfile]:
    client, user_id, _ = _authenticated_user(token)
    doctor = _doctor_identity(client, user_id)
    if doctor is None:
        raise HTTPException(403, "Doctor access denied")
    return client, user_id, doctor


def get_doctor_profile(token: str) -> dict:
    _, _, doctor = _authorized_doctor(token)
    return {"doctor": doctor.model_dump(mode="json")}


def _patient_identity(client: Any, user_id: str, email: str | None) -> PatientProfile:
    with _database_operation("Patient profile unavailable"):
        rows = (
            client.table("patient_profiles").select("full_name,phone")
            .eq("auth_user_id", user_id).limit(1).execute().data
        )
        if not rows or not email:
            raise HTTPException(403, "Patient access denied")
        patient = PatientProfile(id=user_id, name=rows[0]["full_name"], phone=rows[0]["phone"], email=email)
    return patient


def get_patient_profile(token: str) -> dict:
    client, user_id, email = _authenticated_user(token)
    return {"patient": _patient_identity(client, user_id, email)}


def get_auth_identity(token: str) -> dict:
    """Verify the JWT once, then derive the role solely from application tables."""
    client, user_id, email = _authenticated_user(token)
    doctor = _doctor_identity(client, user_id)
    if doctor is not None:
        return {"role": "doctor", "doctor": doctor}
    return {"role": "patient", "patient": _patient_identity(client, user_id, email)}


def _register_auth_user(
    payload: PatientRegistrationInput | DoctorRegistrationInput, readiness_table: str, readiness_column: str,
) -> tuple[Any, str]:
    with _database_operation("Registration unavailable"):
        client = get_client()
        # Fail before creating an Auth user if the BE1 migration is missing.
        client.table(readiness_table).select(readiness_column).limit(1).execute()

    try:
        result = client.auth.admin.create_user({
            "email": payload.email, "password": payload.password, "email_confirm": False,
        })
        return client, str(UUID(str(result.user.id)))
    except Exception as exc:
        code = getattr(exc, "code", None)
        if code in ("email_exists", "user_already_exists"):
            raise HTTPException(409, "Account already exists") from exc
        if code in ("email_address_invalid", "validation_failed", "weak_password"):
            raise HTTPException(422, "Invalid email or password") from exc
        raise HTTPException(503, "Registration unavailable") from exc


def _complete_registration(client: Any, user_id: str, rpc: str, params: dict):
    try:
        return client.rpc(rpc, {"p_user_id": user_id, **params}).execute().data
    except Exception as exc:
        code = getattr(exc, "code", None)
        # A transport failure can arrive after commit. Deleting in that case could
        # remove a valid account and leave a consumed invitation.
        # SQLSTATE classes 22 and 23 are data and integrity errors that abort the RPC.
        rejected_data = isinstance(code, str) and len(code) == 5 and code.startswith(("22", "23"))
        if rejected_data or code in RPC_ERRORS or code in ("PGRST202", "PT503"):
            try:
                client.auth.admin.delete_user(user_id)
            except Exception:
                logger.error("Registration rollback requires reconciliation for Auth user %s", user_id)
                raise HTTPException(503, "Registration unavailable") from None
        else:
            logger.error("Registration outcome requires reconciliation for Auth user %s", user_id)
        raise _rpc_error(exc, "Registration unavailable", conflict="Registration conflicts with existing data") from exc


def _rpc_intervals(intervals: list[WorkingInterval]) -> list[dict]:
    return [
        {
            "weekday": interval.dayOfWeek,
            "startMinute": interval.minutes(interval.startTime),
            "endMinute": interval.minutes(interval.endTime),
        }
        for interval in intervals
    ]


def register_patient(payload: PatientRegistrationInput) -> dict:
    client, user_id = _register_auth_user(payload, "patient_profiles", "auth_user_id")
    result = _complete_registration(client, user_id, "save_patient_profile", {
        "p_full_name": payload.name, "p_phone": payload.phone,
    })
    if result != user_id:
        logger.error("Unexpected patient registration result for Auth user %s", user_id)
        raise HTTPException(503, "Registration unavailable")
    return {"userId": user_id}


def register_doctor(payload: DoctorRegistrationInput) -> dict:
    client, user_id = _register_auth_user(payload, "doctor_schedule_versions", "id")
    result = _complete_registration(client, user_id, "complete_doctor_registration", {
        "p_invite_code": payload.invitationCode, "p_intervals": _rpc_intervals(payload.weeklyIntervals),
    })
    try:
        (row,) = result
        doctor_id = UUID(str(row["doctor_id"]))
        UUID(str(row["schedule_version_id"]))
    except (KeyError, TypeError, ValueError) as exc:
        logger.error("Unexpected doctor registration result for Auth user %s", user_id)
        raise HTTPException(503, "Registration unavailable") from exc
    return {"doctorId": doctor_id}


def get_doctor_schedule(token: str) -> dict:
    client, _, doctor = _authorized_doctor(token)
    with _database_operation("Doctor schedule unavailable"):
        rows = (
            client.table("doctor_schedule_versions")
            .select("effective_from,doctor_working_hours(weekday,start_minute,end_minute)")
            .eq("doctor_id", str(doctor.id)).order("effective_from", desc=True).limit(1).execute().data
        )
        if not rows:
            raise HTTPException(404, "Doctor schedule not found")
        row = rows[0]
        intervals = [
            WorkingInterval(
                dayOfWeek=interval["weekday"],
                startTime=_format_minute(interval["start_minute"]),
                endTime=_format_minute(interval["end_minute"]),
            )
            for interval in row["doctor_working_hours"]
        ]
        schedule = ScheduleResponse(
            timezone="Asia/Ho_Chi_Minh", effectiveDate=row["effective_from"], weeklyIntervals=intervals,
        )
    return schedule.model_dump(mode="json")


def _format_minute(minutes: int) -> str:
    hour, minute = divmod(minutes, 60)
    return f"{hour:02d}:{minute:02d}"


def update_doctor_schedule(payload: ScheduleInput, token: str) -> dict:
    client, user_id, _ = _authorized_doctor(token)
    if payload.effectiveDate <= _today():
        raise HTTPException(422, "Schedule changes require a future effective date")
    try:
        version_id = client.rpc("save_doctor_working_hours", {
            "p_user_id": user_id, "p_effective_from": payload.effectiveDate.isoformat(),
            "p_intervals": _rpc_intervals(payload.weeklyIntervals),
        }).execute().data
        UUID(version_id)
    except Exception as exc:
        if getattr(exc, "code", None) != "PT409":
            raise _rpc_error(exc, "Doctor schedule unavailable") from exc
        if getattr(exc, "message", None) == "A schedule already starts on that date":
            raise HTTPException(409, "Schedule date already in use") from exc
        with _database_operation("Schedule conflict details unavailable"):
            conflict = ScheduleConflict(
                error="SCHEDULE_CONFLICT", conflicts=json.loads(exc.details),
            )
        raise HTTPException(409, conflict.model_dump(mode="json")) from exc
    return payload.model_dump(mode="json")


def list_doctor_appointments(token: str, *, upcoming: bool = False) -> dict:
    client, _, doctor = _authorized_doctor(token)
    with _database_operation("Doctor appointments unavailable"):
        query = (
            client.table("appointments")
            .select("id,patient_name,patient_phone,status,booking_start_at,booking_end_at")
            .eq("booking_doctor_id", str(doctor.id))
        )
        if upcoming:
            query = (
                query.eq("status", "confirmed").gt("booking_start_at", datetime.now(timezone.utc).isoformat())
                .order("booking_start_at").order("id")
            )
        else:
            query = query.in_("status", ["confirmed", "completed", "cancelled"]).order("created_at", desc=True)
            query = query.order("id", desc=True)
        appointments = [
            DoctorAppointment(
                id=row["id"], doctorId=doctor.id, patientName=row["patient_name"],
                patientPhone=row["patient_phone"], startAt=row["booking_start_at"], endAt=row["booking_end_at"],
                status=row["status"],
            )
            for row in query.limit(100).execute().data
        ]
    if upcoming:
        # An appointment can start while the query results are being fetched.
        now = datetime.now(timezone.utc)
        appointments = [appointment for appointment in appointments if appointment.startAt > now]
    return {"appointments": appointments}


def update_doctor_appointment_status(
    appointment_id: UUID, payload: DoctorAppointmentStatusInput, token: str,
) -> dict:
    client, user_id, _ = _authorized_doctor(token)
    try:
        (result,) = client.rpc("update_recurring_appointment_status", {
            "p_appointment_id": str(appointment_id), "p_user_id": user_id, "p_status": payload.status,
        }).execute().data
        appointment = DoctorAppointmentStatusResult.model_validate(result)
        if appointment.id != appointment_id or appointment.status != payload.status:
            raise ValueError("Status RPC returned a different appointment or status")
    except Exception as exc:
        raise _rpc_error(
            exc, "Doctor appointment status unavailable", conflict="Only a confirmed appointment can change status",
        ) from exc
    return {"appointment": appointment.model_dump(mode="json")}


def list_doctor_slots(token: str) -> dict:
    client, _, doctor = _authorized_doctor(token)
    if not doctor.active:
        return {"slots": []}
    start, end = _availability_range(None, None)

    upper_bound = datetime.combine(end + timedelta(days=1), time.min, SCHEDULE_ZONE)

    def query():
        return (
            client.table("appointment_slots").select("id,start_at,end_at")
            .eq("doctor_id", str(doctor.id)).eq("is_published", True).not_.is_("schedule_version_id", "null")
            .gt("start_at", query_started_at.isoformat()).lt("start_at", upper_bound.isoformat())
        )

    with _database_operation("Doctor slots unavailable"):
        available_ids = {slot.id for slot in _available_slots(client, doctor.id, start, end)}
        query_started_at = datetime.now(timezone.utc)
        slots = [
            DoctorSlot(
                id=row["id"], doctorId=doctor.id, startAt=row["start_at"], endAt=row["end_at"],
                available=UUID(row["id"]) in available_ids,
            )
            for row in _ordered_pages(query, "start_at")
        ]
    now = datetime.now(timezone.utc)
    return {"slots": [slot for slot in slots if _is_future_half_hour_slot(slot, now)]}


def list_doctor_notifications(token: str) -> dict:
    client, _, doctor = _authorized_doctor(token)
    with _database_operation("Doctor notifications unavailable"):
        rows = (
            client.table("appointment_notifications")
            .select("id,appointment_id,created_at,read_at,"
                    "appointments!inner(patient_name,booking_start_at,booking_end_at)")
            .eq("doctor_id", str(doctor.id)).eq("appointments.booking_doctor_id", str(doctor.id))
            .order("created_at", desc=True).order("id", desc=True).limit(100).execute().data
        )
        notifications = []
        for row in rows:
            appointment = _one(row["appointments"])
            notifications.append(DoctorNotification(
                id=row["id"], appointmentId=row["appointment_id"], patientName=appointment["patient_name"],
                startAt=appointment["booking_start_at"], endAt=appointment["booking_end_at"],
                createdAt=row["created_at"], readAt=row["read_at"],
            ))
    return {"notifications": notifications}


def mark_doctor_notification_read(notification_id: UUID, token: str) -> dict:
    client, user_id, _ = _authorized_doctor(token)
    try:
        read_at = client.rpc("mark_doctor_notification_read", {
            "p_user_id": user_id, "p_notification_id": str(notification_id),
        }).execute().data
        notification = NotificationReadResult(id=notification_id, readAt=read_at)
    except Exception as exc:
        raise _rpc_error(exc, "Doctor notification unavailable") from exc
    return {"notification": notification}


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
        slot = ManualDoctorSlot(
            id=row["id"], doctorId=row["doctor_id"], startAt=row["start_at"], endAt=row["end_at"],
            isPublished=row["is_published"], available=True,
        )
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
