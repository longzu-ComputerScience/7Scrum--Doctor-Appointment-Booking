"""HTTP payload contracts. Frontend uses camelCase property names."""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


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
