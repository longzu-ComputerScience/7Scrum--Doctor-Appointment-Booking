# FastAPI HTTP Contract — PO 2-Day MVP

**Backend owner:** \`backend/app/\`; **frontend consumer:** \`frontend/src/\`. Browser calls same-origin \`/api/*\`; Next.js proxies via server-side \`BACKEND_URL\` to FastAPI.

**All endpoints return JSON.** Expected errors: \`{"error":"..."}\`; FastAPI validation errors return HTTP 422 with Pydantic \`detail\`. Timestamps use timezone-aware ISO 8601; the UI displays Asia/Ho_Chi_Minh.

| Method / Path | Story | Response |
| --- | --- | --- |
| GET /api/health | Shared | \`{status, databaseConfigured}\` |
| POST /api/consult | US-01 | Controlled follow-up + specialty + real matching doctors |
| POST /api/assistant | Optional legacy search | \`{doctors, filters, usedAI, demoMode, urgent, message}\` |
| GET /api/doctors?specialty=... | US-02 | \`{doctors, demoMode}\` |
| GET /api/doctors/:id | US-02 | \`{doctor, demoMode}\` |
| GET /api/doctors/:id/slots | US-02 / US-03 | \`{slots, demoMode}\` (unbooked only) |
| POST /api/appointments | US-02 | HTTP 201 \`{appointmentId, bookingReference, status:"confirmed"}\` |
| GET /api/staff/doctors | US-03 | Bearer staff JWT; authorized clinic doctors |
| GET /api/staff/slots?doctorId=... | US-03 | Bearer staff JWT; clinic slots incl. \`available\` flag |
| POST /api/staff/slots | US-03 | Bearer staff JWT; HTTP 201 \`{slot}\` |
| GET /api/staff/appointments | US-03 | Bearer staff JWT; clinic-scoped confirmed bookings |
| PATCH /api/appointments/:id | Legacy, out-of-scope for PO MVP | Staff status transitions, not required for acceptance |

## US-01 — Consultation

\`POST /api/consult\` body:

\`\`\`json
{"messages": ["Tôi bị nổi mẩn đỏ", "Khoảng hai ngày"]}
\`\`\`

The frontend sends only patient-authored messages, maximum 4 (2–800 characters each). First supported non-urgent turn returns \`{reply, followUpRequired:true, specialty:null, doctors:[], urgent:false, mode:"controlled-prototype"}\`. After a follow-up, it returns \`{reply, followUpRequired:false, specialty:"Da liễu", doctors:[...], urgent:false, demoMode:boolean, usedAI:boolean, mode:"controlled-prototype"}\`.

This is deliberately **a controlled conversational prototype** for limited symptom scenarios, with optional LLM filter extraction after the follow-up. It is not a trained clinical model, cannot diagnose, and must disclose the prototype nature during the demo. Emergency indicators suppress the routine-doctor list.

## US-02 — Booking

\`POST /api/appointments\`:

\`\`\`json
{"slotId":"<UUID>","patientName":"Demo Patient","patientPhone":"0900000000","notes":""}
\`\`\`

HTTP **201** when the booking is confirmed and persisted in Supabase; **409** when no longer bookable, **422** invalid form, **503** when database not configured. **Do not claim a demo-mode booking succeeded.** Frontend should refetch slots after 409. PostgreSQL \`create_appointment\` RPC + partial unique index prevent two active bookings of a slot. Apply **001_init.sql then 002_po_mvp_schedule.sql**; 002 explicitly enables immediate confirmation. UI and backend must not return confirmed against the old migration.

## US-03 — Clinic-created availability

\`GET /api/staff/doctors\` response \`{"doctors":[{"id","name","specialty","clinicId","clinicName",...}]}\` for clinics in the staff membership.

\`POST /api/staff/slots\`:

\`\`\`json
{"doctorId":"<UUID>","startAt":"2026-11-06T09:00:00+07:00","endAt":"2026-11-06T09:30:00+07:00"}
\`\`\`

Authenticated staff JWT required. Only doctors belonging to the staff's clinic are eligible. Create future non-overlapping 15–120-minute slots within 30 days, 409 on overlap; no room assignment is required for MVP. \`GET /api/staff/slots\` includes \`available:false\` when a non-cancelled appointment occupies that slot. \`GET /api/doctors/:id/slots\` excludes booked slots.

## Integration, safety & environment

- \`SUPABASE_SERVICE_ROLE_KEY\` and optional \`OPENAI_API_KEY\` are **FastAPI-only**. Frontend uses public Supabase URL/anon key solely for test staff login.
- Backend validates Supabase Auth JWT + \`staff_members\` clinic membership. Frontend cannot create schedule slots directly in the database.
- Shared DB across clinic/patient UI is mandatory for the PO scenario.
- Patient registration, payment, notification, cancellation/rescheduling, EHR, advanced ranking and production deployment are **out of the 2-day MVP scope**.
- No real patient or doctor records in sample data. Do not store conversational medical history for this prototype.
