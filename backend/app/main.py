"""FastAPI routes for the booking and Doctor dashboard contracts."""
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.assistant import search_from_message
from app.consult import consult
from app.config import allowed_origins, is_database_configured
from app.schemas import (
    APIErrorResponse, AssistantInput, AuthIdentityResponse, BookingInput, BookingResponse, CalendarDate, ConsultationInput,
    DoctorAppointmentListResponse,
    DoctorAppointmentStatusInput, DoctorAppointmentStatusResponse, DoctorDetailResponse, DoctorListResponse,
    DoctorNotificationListResponse, DoctorProfileResponse, DoctorRegistrationInput, DoctorRegistrationResponse,
    DoctorSlotCreateResponse, DoctorSlotInput, DoctorSlotListResponse, NotificationReadInput, NotificationReadResponse,
    PatientProfileResponse, PatientRegistrationInput, PatientRegistrationResponse, ScheduleConflict, ScheduleInput,
    ScheduleResponse, ScheduleUpdateResponse, SlotListResponse, StaffSlotInput, StatusInput, ValidationErrorResponse,
    ValidationIssue,
)
from app.service import (
    create_booking, create_doctor_slot, create_staff_slot, get_auth_identity, get_doctor, get_doctor_profile,
    get_doctor_schedule,
    get_patient_profile, get_slots, list_doctor_appointments, list_doctor_notifications, list_doctor_slots,
    list_staff_appointments, list_staff_doctors, list_staff_slots, mark_doctor_notification_read, register_doctor,
    register_patient, search_doctors, update_doctor_appointment_status, update_doctor_schedule, update_status,
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Staff login required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Staff login required")
    return token


def _session_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(bearerFormat="JWT", auto_error=False)),
) -> str:
    if credentials is None or not credentials.credentials.strip():
        raise HTTPException(401, "Login required")
    return credentials.credentials.strip()


UNAVAILABLE = {503: {"model": APIErrorResponse, "description": "Service unavailable"}}
AUTH_ERRORS = {
    **UNAVAILABLE,
    401: {"model": APIErrorResponse, "description": "Login required or session invalid"},
    403: {"model": APIErrorResponse, "description": "Access denied"},
}
NOT_FOUND = {404: {"model": APIErrorResponse, "description": "Resource not found"}}
INVALID_INPUT = {422: {"model": ValidationErrorResponse, "description": "Invalid request or input"}}
REGISTRATION_CONFLICT = {409: {"model": APIErrorResponse, "description": "Registration conflicts with existing data"}}


@app.get("/api/auth/me", response_model=AuthIdentityResponse, responses=AUTH_ERRORS)
def auth_me(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return get_auth_identity(token)


@app.post(
    "/api/auth/patients/register", status_code=201, response_model=PatientRegistrationResponse,
    responses={**UNAVAILABLE, **REGISTRATION_CONFLICT, **INVALID_INPUT},
)
def patient_registration(payload: PatientRegistrationInput) -> dict:
    return register_patient(payload)


@app.post(
    "/api/auth/doctors/register", status_code=201, response_model=DoctorRegistrationResponse,
    responses={
        **UNAVAILABLE, **REGISTRATION_CONFLICT, **INVALID_INPUT,
        403: {"model": APIErrorResponse, "description": "Invalid invitation"},
    },
)
def doctor_registration(payload: DoctorRegistrationInput) -> dict:
    return register_doctor(payload)


@app.get("/api/patient/me", response_model=PatientProfileResponse, responses=AUTH_ERRORS)
def patient_me(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return get_patient_profile(token)


@app.get("/api/doctor/me", response_model=DoctorProfileResponse, responses=AUTH_ERRORS)
def doctor_me(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return get_doctor_profile(token)


@app.get("/api/doctor/schedule", response_model=ScheduleResponse, responses={**AUTH_ERRORS, **NOT_FOUND})
def doctor_schedule(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return get_doctor_schedule(token)


@app.put(
    "/api/doctor/schedule", response_model=ScheduleUpdateResponse,
    responses={
        **AUTH_ERRORS, **INVALID_INPUT,
        409: {"model": ScheduleConflict | APIErrorResponse, "description": "Schedule or effective-date conflict"},
    },
)
def change_doctor_schedule(payload: ScheduleInput, token: str = Depends(_session_token)) -> dict:
    return update_doctor_schedule(payload, token)


@app.get("/api/doctor/notifications", response_model=DoctorNotificationListResponse, responses=AUTH_ERRORS)
def doctor_notifications(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return list_doctor_notifications(token)


@app.patch(
    "/api/doctor/notifications/{id}", response_model=NotificationReadResponse,
    responses={**AUTH_ERRORS, **NOT_FOUND, **INVALID_INPUT},
)
def read_doctor_notification(
    notification_id: Annotated[UUID, Path(alias="id")],
    payload: NotificationReadInput,
    token: str = Depends(_session_token),
) -> dict:
    return mark_doctor_notification_read(notification_id, token)


@app.get(
    "/api/doctor/appointments", response_model=DoctorAppointmentListResponse,
    responses={**AUTH_ERRORS, **INVALID_INPUT},
)
def doctor_appointments(
    response: Response,
    token: str = Depends(_session_token),
    view: Literal["upcoming"] | None = Query(None),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return list_doctor_appointments(token, upcoming=view == "upcoming")


@app.patch(
    "/api/doctor/appointments/{id}",
    response_model=DoctorAppointmentStatusResponse,
    responses={
        **AUTH_ERRORS, **NOT_FOUND, **INVALID_INPUT,
        409: {"model": APIErrorResponse, "description": "Invalid transition or appointment status changed"},
    },
)
def change_doctor_appointment(
    appointment_id: Annotated[UUID, Path(alias="id")],
    payload: DoctorAppointmentStatusInput,
    token: str = Depends(_session_token),
) -> dict:
    return update_doctor_appointment_status(appointment_id, payload, token)


@app.get("/api/doctor/slots", response_model=DoctorSlotListResponse, responses=AUTH_ERRORS)
def doctor_slots(response: Response, token: str = Depends(_session_token)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return list_doctor_slots(token)


@app.post(
    "/api/doctor/slots",
    status_code=201,
    response_model=DoctorSlotCreateResponse,
    responses={
        **AUTH_ERRORS,
        409: {"model": APIErrorResponse, "description": "Doctor or slot conflicts with the current schedule"},
    },
)
def add_doctor_slot(payload: DoctorSlotInput, token: str = Depends(_session_token)) -> dict:
    return create_doctor_slot(payload, token)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "databaseConfigured": is_database_configured()}


@app.get("/api/doctors", response_model=DoctorListResponse, responses={**UNAVAILABLE, **INVALID_INPUT})
def doctors(
    specialty: str | None = Query(None, max_length=80),
    district: str | None = Query(None, max_length=80),
    keyword: str | None = Query(None, max_length=100),
) -> dict:
    return search_doctors(specialty=specialty, district=district, keyword=keyword)


@app.get(
    "/api/doctors/{doctorId}", response_model=DoctorDetailResponse,
    responses={**NOT_FOUND, **UNAVAILABLE, **INVALID_INPUT},
)
def doctor_detail(doctor_id: Annotated[UUID, Path(alias="doctorId")]) -> dict:
    return get_doctor(doctor_id)


@app.get(
    "/api/doctors/{doctorId}/slots", response_model=SlotListResponse,
    responses={**NOT_FOUND, **UNAVAILABLE, **INVALID_INPUT},
)
def slots(
    doctor_id: Annotated[UUID, Path(alias="doctorId")],
    response: Response,
    start: CalendarDate | None = Query(None, alias="from"),
    end: CalendarDate | None = Query(None, alias="to"),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return get_slots(doctor_id, start, end)


@app.post("/api/assistant")
async def assistant(payload: AssistantInput) -> dict:
    return await search_from_message(payload.message.strip())


@app.post(
    "/api/appointments",
    status_code=201,
    response_model=BookingResponse,
    responses={
        **AUTH_ERRORS, **INVALID_INPUT,
        409: {"model": APIErrorResponse, "description": "Slot is no longer available"},
    },
)
def book(payload: BookingInput, token: str = Depends(_session_token)) -> dict:
    return create_booking(payload, token)


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
    content = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
    response = JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)
    # A cached 404 can hide newly available schedules or slots after a reconnect.
    response.headers["Cache-Control"] = "no-store"
    if exc.status_code == 401 and "WWW-Authenticate" not in response.headers:
        response.headers["WWW-Authenticate"] = "Bearer"
    return response


@app.exception_handler(RequestValidationError)
async def validation_errors(_request, exc: RequestValidationError):
    # A Pydantic error can contain the entire input, including a password or invitation.
    detail = [ValidationIssue(loc=item["loc"], msg=item["msg"], type=item["type"]) for item in exc.errors()]
    body = ValidationErrorResponse(error="Invalid input", detail=detail)
    return JSONResponse(status_code=422, content=body.model_dump(mode="json"))


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
