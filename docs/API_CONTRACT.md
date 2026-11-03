# API Contract — 7Scrum MVP

All responses are JSON. Failure responses contain an error string.

## Search
GET /api/doctors?specialty=&district=&keyword=
Response: { doctors: Doctor[], demoMode: boolean }

POST /api/assistant
Request: { message: string } (2–800 characters)
Response: { doctors: Doctor[], filters: { specialty, district, keyword }, usedAI: boolean, demoMode: boolean, urgent: boolean, message: string }

AI tool calling extracts filters only. The backend searches the real catalog. No hallucinated doctor records are displayed. Without OPENAI_API_KEY, simple keyword filtering is available. This MVP implements single-turn search, not full conversational memory.

Doctor properties: id, name, specialty, bio, clinicId, clinicName, clinicAddress, district.

## Doctor & Slots
GET /api/doctors/:id -> { doctor: Doctor, demoMode: boolean }
GET /api/doctors/:id/slots -> { slots: AppointmentSlot[], demoMode: boolean }
Slot properties: id, doctorId, clinicId, startAt, endAt, roomName.
Timestamps are ISO UTC; display in Asia/Ho_Chi_Minh. A listed slot is not reserved.

## Booking
POST /api/appointments
Request: { slotId: UUID, patientName: string, patientPhone: string, notes?: string }
201 Created: { appointmentId, bookingReference, status: "requested" }
400 Invalid input
409 Slot conflict (frontend should reload available slots)
503 Supabase not configured / unavailable
A PostgreSQL partial unique index is the final double-booking guard.

## Staff
GET /api/staff/appointments with Authorization: Bearer <Supabase Auth access token>
Response: { appointments: [{ id, patientName, patientPhone, doctorName, clinicName, startAt, status }] }
PATCH /api/appointments/:id with same Authorization header
Body: { status: "confirmed" | "checked_in" | "completed" | "cancelled" }
Status flow: requested -> confirmed -> checked_in -> completed; cancellation is permitted before completion.
Auth errors 401/403, invalid transition or concurrency 409.

## Privacy & Security
Never expose SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY in frontend. No real patient history in demo. Before production, add abuse prevention/rate limiting, consent, privacy/retention policy, audit logs, and independent security review.
