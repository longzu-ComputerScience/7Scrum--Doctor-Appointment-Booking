# Documentation guide — PO scope and V2 target

**Updated:** 2026-11-04. This guide explains source precedence and the **V1 → V2 transition**; it does not certify that code or the live database implements V2.

## Authoritative references

1. **Product scope and acceptance:** [PO — SMART HOSPITAL PATIENT APPOINTMENT SYSTEM, tab "Ver1 của Linh"](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). Three must-have stories: US-01 consultation/specialty; US-02 doctor discovery and booking; US-03 clinic staff schedule/appointment dashboard. The PO approves acceptance and changes of scope.
2. **Target HTTP/API semantics:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md). JSON camelCase, doctor-scoped staff access, booking initially `requested`. It describes a **target**, not necessarily the current runtime.
3. **Target entities, constraints, permissions and migration design:** [DATA_DICTIONARY.md](DATA_DICTIONARY.md). Four business tables/29 columns: `doctors`, `appointment_slots`, `appointments`, `staff_members`; no `clinics` or `rooms`.
4. **Reference SQL for a new/empty Supabase database:** [schema_v2.sql](../supabase/schema_v2.sql). It is **not** a V1-to-V2 migration and must **not** be run on an existing database. Confirm live schema first; existing deployments require a separate audited data-preserving migration (Data Dictionary §9).

**Historical/current implementation reference:** [API_CONTRACT.md](API_CONTRACT.md) describes the V1 clinic-scoped, immediate-confirmation API. It is retained for comparing/maintaining V1 code, **not** as the contract for new V2 work. Existing V1 migrations and seed files are likewise not proof that V2 was applied. Never mix V1-only fields (`clinicId`, `clinicName`, `clinicAddress`, `roomId`) into V2 responses.

## Product vs implementation — decisions to resolve

- **Booking confirmation:** V2 `POST /api/appointments` returns HTTP 201 with `status: "requested"`: a persisted request, **not a confirmed appointment**. Staff can confirm via `PATCH /api/appointments/{id}`, after which the staff confirmed view can meet the final PO demo. The PO tab linked above uses "booking confirmation"/"confirmed appointment" language; the separate Google Doc tab "Requirements của Thiên An" explicitly uses initial `requested`. **Lead/PO must approve the resulting two-step demo/acceptance wording**; do not hardcode `confirmed` or show false success.
- **Clinic staff vs doctor self-management:** In the linked PO tab the US-03 actor is **clinic staff**. V2 represents authorization as `staff_members(user_id, doctor_id)`: staff manage **assigned doctors**, not clinics. Another tab ("Requirements của Thiên An") and parts of the "Sprint planning" tab refer to doctors managing their **own** schedules, which is a **different product role**. Do not silently switch login/persona or promise doctor self-service; Lead/PO must resolve the discrepancy.
- **Staff schedule endpoints and permissions:** V2 currently specifies `GET /api/staff/appointments` and `PATCH /api/appointments/{id}`, but **does not yet define** `GET /api/staff/doctors`, `GET /api/staff/slots` or `POST /api/staff/slots`. Data Dictionary §3.6 does not grant slot-administration rights via the existing API, and `schema_v2.sql` does not grant direct table writes to `service_role`. BE2 **#32** and Lead **#36** must agree on a secure doctor-scoped API, DB write path, errors and authorization; BE1 **#31** owns DB changes. Keep this gap visible until contract, schema and implementation are actually updated.
- **Runtime state:** A merged PR, a passing CI run, or files present on `main` do **not** prove that the shared Supabase database has been migrated, staff endpoints work, or the PO six-step flow passed.

## Current work tracking (only TODAY issues remain open)

| Role | US-02 existing work | US-03 continuation |
| --- | --- | --- |
| BE1 | #3 | [#31](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/31) |
| BE2 | #26 | [#32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32) |
| FE1 | #5 | [#33](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/33) |
| FE2 | #7 (closed; PR #27 merged) | [#34](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/34) |
| Tester | #9 | [#35](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/35) |
| Lead | #25 | [#36](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/36) |

Historical issues #21, #22, #8, #19 were closed in favor of #32, #34, #33, #35 respectively; closing **did not mean completion**. Other closed issues are history, not active dependencies. US-01 remains part of PO scope even though its former issues are closed: Lead must ensure the consultation flow is implemented and verified.

## Verification before release

Consult [USER_STORIES.md](USER_STORIES.md), [ACCEPTANCE_SCENARIO.md](ACCEPTANCE_SCENARIO.md), [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Record the tested commit SHA, API version, **actual DB schema/migration**, synthetic test data, 401/403/409/422/503 paths, concurrency, UTC/+07 rendering and the PO decision. Do not claim acceptance from static documentation.
