"""HTTP payload contracts. Frontend uses camelCase property names."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class AssistantInput(BaseModel):
    message: str = Field(min_length=2, max_length=800)


class BookingInput(BaseModel):
    slotId: UUID
    patientName: str = Field(min_length=2, max_length=100)
    patientPhone: str = Field(pattern=r"^\+?[0-9 ()-]{9,20}$")
    notes: str = Field(default="", max_length=500)

    @field_validator("patientName")
    @classmethod
    def validate_patient_name(cls, name: str) -> str:
        if len(name.strip()) < 2:
            raise ValueError("Patient name is too short")
        return name.strip()


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
