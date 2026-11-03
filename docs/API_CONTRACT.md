# FastAPI HTTP Contract — 7Scrum MVP

**Owner:** `backend/app/` (Python). **Consumer:** `frontend/src/` (TypeScript). The frontend uses same-origin `/api/*` requests; Next.js rewrites these to FastAPI via `BACKEND_URL`.

Interactive backend OpenAPI docs: `http://127.0.0.1:8000/docs`.

| Method / Path | Purpose | Response |
|---|---|---|
| GET /api/health | Health check | `{status: 'ok', databaseConfigured: boolean}` |
| GET /api/doctors?specialty=&district=&keyword= | Filter doctors | `{doctors: Doctor[], demoMode: boolean}` |
| GET /api/doctors/:id | Doctor/clinic detail | `{doctor: Doctor, demoMode: boolean}` |
| GET /api/doctors/:id/slots | Upcoming available slots | `{slots: Slot[], demoMode: boolean}` |
| POST /api/assistant | Natural-language search | `{doctors, filters, usedAI, demoMode, urgent, message}` |
| POST /api/appointments | Atomic booking via RPC | HTTP 201: `{appointmentId, bookingReference, status: 'requested'}` |
| GET /api/staff/appointments | Authorized clinic bookings | `{appointments: StaffAppointment[]}` |
| PATCH /api/appointments/:id | Staff appointment status change | `{appointment: {id, status}}` |

**Assistant body:** `{message: string}` (2–800 characters). AI only extracts search filters and does not fabricate doctors or create appointments.

**Booking body:** `{slotId: UUID, patientName: string, patientPhone: string, notes?: string}`. HTTP 409 when slot already occupied, 503 when Supabase is not configured or unavailable; invalid input HTTP 422 (FastAPI/Pydantic). Slot list is not a reservation. UI should refetch on 409.

**Staff:** Supabase Auth Bearer JWT sent in `Authorization` header. Backend verifies user and clinic membership before reading or changing appointments. Transitions: requested → confirmed → checked_in → completed; cancellation permitted before completion. HTTP 401/403/404/409 for expected auth/status errors.

**Data:** doctor id, name, specialty, bio, clinicId, clinicName, clinicAddress, district. Slots include id, doctorId, clinicId, startAt, endAt, roomName. All timestamps ISO with timezone; frontend displays Asia/Ho_Chi_Minh.

**Security:** Backend owns `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`; never expose either in the frontend. Use only fictional demo provider/patient data. Before production, implement rate-limits, abuse controls, privacy/retention policies, incident response, and audit logs.
