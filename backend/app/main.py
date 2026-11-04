"""FastAPI application. Routes preserve the original frontend JSON contract."""
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.assistant import search_from_message
from app.consult import consult
from app.config import allowed_origins, is_database_configured
from app.schemas import (
    APIErrorResponse, AssistantInput, BookingInput, BookingResponse, ConsultationInput, DoctorListResponse,
    StaffSlotInput, StatusInput,
)
from app.service import (
    create_booking, get_doctor, get_slots, list_staff_appointments,
    search_doctors, update_status, list_staff_doctors, list_staff_slots, create_staff_slot,
)

app = FastAPI(
    title="7Scrum Doctor Appointment Booking API",
    description="Scheduling and doctor discovery only; not a medical diagnostic service.",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Staff login required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Staff login required")
    return token


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "databaseConfigured": is_database_configured()}


@app.get("/api/doctors", response_model=DoctorListResponse)
def doctors(
    specialty: str | None = Query(None, max_length=80),
    district: str | None = Query(None, max_length=80),
    keyword: str | None = Query(None, max_length=100),
) -> dict:
    return search_doctors(specialty=specialty, district=district, keyword=keyword)


@app.get("/api/doctors/{doctor_id}")
def doctor_detail(doctor_id: UUID) -> dict:
    return get_doctor(doctor_id)


@app.get("/api/doctors/{doctor_id}/slots")
def slots(doctor_id: UUID) -> dict:
    return get_slots(doctor_id)


@app.post("/api/assistant")
async def assistant(payload: AssistantInput) -> dict:
    return await search_from_message(payload.message.strip())


@app.post(
    "/api/appointments",
    status_code=201,
    response_model=BookingResponse,
    responses={
        409: {"model": APIErrorResponse, "description": "Slot is no longer available"},
        503: {"model": APIErrorResponse, "description": "Booking service unavailable"},
    },
)
def book(payload: BookingInput) -> dict:
    return create_booking(payload)


@app.get("/api/staff/appointments")
def staff_appointments(authorization: str | None = Header(None)) -> dict:
    return list_staff_appointments(_bearer(authorization))


@app.patch("/api/appointments/{appointment_id}")
def change_appointment(
    appointment_id: UUID, payload: StatusInput,
    authorization: str | None = Header(None),
) -> dict:
    return update_status(appointment_id, payload.status, _bearer(authorization))


@app.exception_handler(HTTPException)
async def api_errors(_request, exc: HTTPException):
    # Preserve original Next.js API error shape expected by UI.
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})



@app.post("/api/consult")
async def consultation(payload: ConsultationInput) -> dict:
    return await consult(payload.messages)


@app.get("/api/staff/doctors")
def staff_doctors(authorization: str | None = Header(None)) -> dict:
    return list_staff_doctors(_bearer(authorization))


@app.get("/api/staff/slots")
def staff_slots(
    doctor_id: UUID | None = Query(None, alias="doctorId"),
    authorization: str | None = Header(None),
) -> dict:
    return list_staff_slots(_bearer(authorization), doctor_id)


@app.post("/api/staff/slots", status_code=201)
def add_staff_slot(
    payload: StaffSlotInput,
    authorization: str | None = Header(None),
) -> dict:
    return create_staff_slot(payload, _bearer(authorization))
