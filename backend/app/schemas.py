"""HTTP payload contracts. Frontend uses camelCase property names."""
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator, AwareDatetime, BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator,
)


UtcDatetime = Annotated[AwareDatetime, AfterValidator(lambda value: value.astimezone(timezone.utc))]


def _parse_date(value: object) -> date:
    if isinstance(value, str) and len(value) == 10:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() == value:
            return parsed
    raise ValueError("Use YYYY-MM-DD")


CalendarDate = Annotated[date, BeforeValidator(_parse_date)]


class Doctor(BaseModel):
    """Public catalog fields."""

    id: UUID
    name: str
    specialty: str
    bio: str
    address: str
    district: str
    certificates: list["Certificate"]
    rating: float | None
    ratingCount: int


class Certificate(BaseModel):
    name: str
    issuer: str
    issuedYear: int | None = None
    credentialUrl: str | None = None


class DoctorListResponse(BaseModel):
    doctors: list[Doctor]
    demoMode: bool


class DoctorDetailResponse(BaseModel):
    doctor: Doctor
    demoMode: bool


class AvailableSlot(BaseModel):
    id: UUID
    doctorId: UUID
    startAt: UtcDatetime
    endAt: UtcDatetime


class SlotListResponse(BaseModel):
    slots: list[AvailableSlot]
    demoMode: bool


class DoctorProfile(BaseModel):
    id: UUID
    name: str
    specialty: str
    active: bool


class DoctorProfileResponse(BaseModel):
    doctor: DoctorProfile


AppointmentStatus = Literal["confirmed", "completed", "cancelled"]


class DoctorAppointment(AvailableSlot):
    patientName: str
    patientPhone: str
    status: AppointmentStatus


class DoctorAppointmentListResponse(BaseModel):
    appointments: list[DoctorAppointment]


DoctorAppointmentStatusTarget = Literal["completed", "cancelled"]


class DoctorAppointmentStatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: DoctorAppointmentStatusTarget


class DoctorAppointmentStatusResult(BaseModel):
    id: UUID
    status: DoctorAppointmentStatusTarget


class DoctorAppointmentStatusResponse(BaseModel):
    appointment: DoctorAppointmentStatusResult


class DoctorSlot(AvailableSlot):
    available: bool


class DoctorSlotListResponse(BaseModel):
    slots: list[DoctorSlot]


class ManualDoctorSlot(DoctorSlot):
    isPublished: bool


class DoctorSlotCreateResponse(BaseModel):
    slot: ManualDoctorSlot


class DoctorSlotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startAt: UtcDatetime
    endAt: UtcDatetime

    @field_validator("startAt", "endAt", mode="before")
    @classmethod
    def parse_timestamp(cls, value: object) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value.strip())
        raise ValueError("Timestamps must be ISO 8601 strings")

    @model_validator(mode="after")
    def check_period(self):
        if self.startAt <= datetime.now(timezone.utc):
            raise ValueError("Slot must be in the future")
        if self.endAt - self.startAt != timedelta(minutes=30):
            raise ValueError("Doctor slots must be exactly 30 minutes")
        return self


class AssistantInput(BaseModel):
    message: str = Field(min_length=2, max_length=800)


def _normalize_text(value: object) -> object:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value).strip()
    return value


def _reject_nul(value: str) -> str:
    if "\x00" in value:
        raise ValueError("NUL characters are not allowed")
    return value


def _validate_phone_digits(phone: str) -> str:
    if sum("0" <= char <= "9" for char in phone) < 9:
        raise ValueError("Patient phone must contain at least 9 ASCII digits")
    return phone


class BookingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slotId: UUID
    patientName: str = Field(strict=True, min_length=2, max_length=100)
    patientPhone: str = Field(strict=True, pattern=r"^\+?[0-9 ()-]{9,20}$")
    notes: str = Field(default="", strict=True, max_length=500)

    normalize_text = field_validator("slotId", "patientName", "patientPhone", "notes", mode="before")(_normalize_text)
    validate_phone_digits = field_validator("patientPhone")(_validate_phone_digits)
    validate_notes = field_validator("notes")(_reject_nul)


class BookingResponse(BaseModel):
    appointmentId: UUID
    bookingReference: str = Field(pattern=r"^[0-9A-F]{12}$")
    status: Literal["confirmed"]


class WorkingInterval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dayOfWeek: int = Field(strict=True, ge=1, le=7)
    startTime: str = Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    endTime: str = Field(pattern=r"^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")

    @staticmethod
    def minutes(value: str) -> int:
        hour, minute = map(int, value.split(":"))
        return hour * 60 + minute

    @model_validator(mode="after")
    def check_duration(self):
        duration = self.minutes(self.endTime) - self.minutes(self.startTime)
        if duration < 30 or duration % 30:
            raise ValueError("Working intervals must be positive multiples of 30 minutes")
        return self


class WeeklyIntervals(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weeklyIntervals: list[WorkingInterval] = Field(min_length=1, max_length=336)

    @field_validator("weeklyIntervals")
    @classmethod
    def check_overlap(cls, intervals: list[WorkingInterval]) -> list[WorkingInterval]:
        ordered = sorted(intervals, key=lambda item: (item.dayOfWeek, item.startTime))
        for previous, current in zip(ordered, ordered[1:]):
            if previous.dayOfWeek == current.dayOfWeek and current.startTime < previous.endTime:
                raise ValueError("Working intervals on the same day must not overlap")
        return ordered


class ScheduleInput(WeeklyIntervals):
    effectiveDate: CalendarDate


class ScheduleUpdateResponse(WeeklyIntervals):
    effectiveDate: date


class ScheduleResponse(ScheduleUpdateResponse):
    timezone: Literal["Asia/Ho_Chi_Minh"]


class ConflictingAppointment(BaseModel):
    appointmentId: UUID
    startAt: UtcDatetime
    endAt: UtcDatetime


class ScheduleConflict(BaseModel):
    error: Literal["SCHEDULE_CONFLICT"]
    conflicts: list[ConflictingAppointment] = Field(min_length=1)


class RegistrationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=8, max_length=72, repr=False)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    validate_text = field_validator("email", "password")(_reject_nul)


class PatientRegistrationInput(RegistrationInput):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(pattern=r"^\+?[0-9 ()-]{9,20}$")

    normalize_text = field_validator("name", "phone", mode="before")(_normalize_text)
    validate_name = field_validator("name")(_reject_nul)
    validate_phone_digits = field_validator("phone")(_validate_phone_digits)


class DoctorRegistrationInput(RegistrationInput, WeeklyIntervals):
    invitationCode: str = Field(min_length=1, max_length=128, repr=False)

    validate_invitation = field_validator("invitationCode")(_reject_nul)


class PatientRegistrationResponse(BaseModel):
    userId: UUID


class DoctorRegistrationResponse(BaseModel):
    doctorId: UUID


class PatientProfile(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str


class PatientProfileResponse(BaseModel):
    patient: PatientProfile


class DoctorNotification(BaseModel):
    id: UUID
    appointmentId: UUID
    patientName: str
    startAt: UtcDatetime
    endAt: UtcDatetime
    createdAt: UtcDatetime
    readAt: UtcDatetime | None


class DoctorNotificationListResponse(BaseModel):
    notifications: list[DoctorNotification]


class NotificationReadInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    read: Literal[True]

    @field_validator("read", mode="before")
    @classmethod
    def require_true(cls, value: object) -> bool:
        if value is not True:
            raise ValueError("read must be true")
        return True


class NotificationReadResult(BaseModel):
    id: UUID
    readAt: UtcDatetime


class NotificationReadResponse(BaseModel):
    notification: NotificationReadResult


class APIErrorResponse(BaseModel):
    error: str


class ValidationIssue(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ValidationErrorResponse(APIErrorResponse):
    detail: list[ValidationIssue] = Field(default_factory=list)


class StatusInput(BaseModel):
    status: Literal["confirmed", "checked_in", "completed", "cancelled"]


ALLOWED_TRANSITIONS = {
    "requested": {"confirmed", "cancelled"},
    "confirmed": {"checked_in", "cancelled"},
    "checked_in": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


class ConsultationInput(BaseModel):
    # All messages are user-authored; no persistent chat or medical history.
    messages: list[str] = Field(min_length=1, max_length=4)

    @field_validator("messages")
    @classmethod
    def check_messages(cls, messages: list[str]) -> list[str]:
        if any(len(m.strip()) < 2 or len(m) > 800 for m in messages):
            raise ValueError("Each message must be 2-800 characters")
        return [m.strip() for m in messages]


class StaffSlotInput(BaseModel):
    doctorId: UUID
    startAt: datetime
    endAt: datetime

    @model_validator(mode="after")
    def check_period(self):
        if self.startAt.tzinfo is None or self.endAt.tzinfo is None:
            raise ValueError("Timestamps must include timezone offset")
        now = datetime.now(timezone.utc)
        if self.startAt <= now:
            raise ValueError("Slot must be in the future")
        if self.startAt > now + timedelta(days=30):
            raise ValueError("MVP only accepts slots within the next 30 days")
        duration = self.endAt - self.startAt
        if duration < timedelta(minutes=15) or duration > timedelta(hours=2):
            raise ValueError("Slot duration must be 15-120 minutes")
        return self
