# User Stories — 7Scrum MVP

These six stories reflect the team notes. **Priority:** P0 user journey coverage, but completion must be verified individually. All clinical guidance is limited to specialty discovery, not diagnosis. The PO must confirm that the scope is feasible within the 48-hour sprint.

| ID | Module | User story | Implementation area |
| --- | --- | --- | --- |
| US-01 | Symptom Intake | As a patient, I want to enter my symptoms so that the system understands my health concerns. | `frontend/` input, `backend/` query validation |
| US-02 | Symptom Intake | As a patient, I want to review and edit my symptoms before submitting them. | `frontend/` editable form, client state |
| US-03 | Smart Doctor Suggestion | As a patient, I want to receive doctor recommendations based on my symptoms so that I can choose a suitable specialist. | `backend/` bounded AI/filter extraction + real catalog, `frontend/` result cards |
| US-04 | Smart Doctor Suggestion | As a patient, I want to see doctors' profiles and available time slots so that I can make an informed choice. | `frontend/` doctor/clinic page, `backend/` doctor and slot API |
| US-05 | Appointment Scheduling | As a patient, I want to book an available appointment so that I can avoid unnecessary waiting. | `frontend/` booking UI, `backend/` atomic booking API + Supabase RPC |
| US-06 | Clinic Sync | As clinic staff, I want confirmed appointments to appear in the clinic's schedule so that bookings can be managed efficiently. | `frontend/` staff dashboard, `backend/` clinic-scoped appointment API |

## Acceptance criteria by story

### US-01 — Input symptoms
- Patient sees a clearly labeled, optional symptom description entry without being required to share sensitive medical history in the demo.
- Submission rejects empty/oversized text as applicable and displays a clear validation message.
- The system labels the output as a specialty/doctor suggestion, not a diagnosis.
- Emergency warning handling does not direct urgent cases to routine appointment booking.

### US-02 — Review/edit before submission
- Patient can inspect the entered description before submitting and can revise/cancel it without losing data unexpectedly.
- No AI/API request is sent before explicit submission.
- The submission displays loading/error states and does not submit twice accidentally.

### US-03 — Suggested doctors
- A natural-language search returns doctor+clinic records that actually exist in the current catalog.
- Specialty and district filters are applied by the backend, and unsupported symptoms are not diagnosed.
- A failed/unconfigured AI provider falls back to conservative keyword search with transparent messaging.
- Empty results do not invent a doctor.

### US-04 — Doctor profile and slots
- Profile shows name, specialty, clinic/location and the list of currently offered slots from API.
- The selected doctor ID is preserved when navigating to booking.
- An empty/no-availability response is clearly shown.
- Clinic and examination room are differentiated; a room is shown only when assigned.

### US-05 — Book available appointment
- Patient selects doctor, slot and provides required contact data.
- Backend validates input and transactionally reserves slot; success returns a booking reference.
- Concurrent attempts for one slot cannot both create active reservations.
- An HTTP 409 conflict refreshes available slots; a demo without Supabase never displays fake booking success.

### US-06 — Clinic appointment visibility
- Authorized clinic staff can sign in and see appointments for their own clinic only.
- Requested/confirmed statuses are distinguishable, and staff can confirm/check in/complete or cancel along allowed transitions.
- Once confirmed, the appointment is visible in the clinic schedule after refresh.
- Unauthorized access and invalid state transitions are rejected by FastAPI.

## Traceability and scope

Reference GitHub issues in the project backlog for implementation and `docs/DEFINITION_OF_DONE.md` for release gates. Existing search and booking skeletons are **not proof of story completion**. Record test evidence and PO acceptance before closing issues.
