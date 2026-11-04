# PO-Approved Product Backlog — 2-day MVP

**Product source:** Google Doc [SMART HOSPITAL PATIENT APPOINTMENT SYSTEM (tab t.0)](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8), read 2026-11-04. **Target implementation references:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). Read [DOCS_GUIDE.md](DOCS_GUIDE.md) before treating V1 runtime/docs as V2. The linked PO tab states clinic staff; another tab proposes doctor self-management, pending Lead/PO clarification.

**Important:** The previous six-story numbering is superseded. **Only US-01, US-02 and US-03** are approved must-have stories for this 2-day MVP. Technical tasks may be split into multiple GitHub issues; those issue titles must refer to the *new* US IDs.

## US-01 — AI Symptom Consultation & Specialty Suggestion (P0)

> As a patient, I want to describe my symptoms and interact with an AI chatbot, so that I can receive guidance and a suitable medical specialty suggestion.

- **AC01** Patient enters a supported symptom description using a chatbot interface.
- **AC02** Chatbot asks at least one basic follow-up question.
- **AC03** Chatbot suggests a relevant *specialty*, not a diagnosis.
- **AC04** Suggested specialty is visibly displayed to the patient.
- **AC05** Recognized emergency-warning indicators lead to urgent assistance guidance, *not* routine recommendation.
- **AC06** Patient can proceed to doctor selection already filtered by that specialty.

**Deliverables:** chat UI, follow-up exchange, controlled specialty mapping, result card/continuation to US-02. Scope limited to predefined scenarios; rule-based or controlled conversational demo is permitted, but must be explicitly disclosed in the demo. Existing third-party AI API is optional.

## US-02 — Doctor Selection & Appointment Booking (P0)

> As a patient, I want to select a doctor and book an available appointment, so that I can schedule a consultation with a suitable doctor.

- **AC01** List doctors matching specialty from US-01.
- **AC02** Display doctor name and specialty.
- **AC03** Select doctor; see open dates and time slots from US-03 (not invented).
- **AC04** Select slot; enter name and phone number.
- **AC05** Save appointment persistently and show booking confirmation.
- **AC06** Booked slot is unavailable to other patients; no double booking.

**Deliverables:** specialty-filtered doctor list, slot/date selector, validated form, a **persisted booking request** and booking-result screen. Under V2 the initial status is `requested` (pending staff confirmation), not `confirmed`; the patient receives a booking reference. After staff confirmation the appointment becomes `confirmed`. The PO tab t.0 describes a booking confirmation and confirmed staff view, so **Lead/PO must sign off on this two-step interpretation**. Booking must survive refresh; patient registration is not required. Never display a fake confirmed result.

## US-03 — Doctor Schedule Management Dashboard (P0)

> As a clinic staff member, I want to input and manage doctors' available appointment schedules through a dashboard, so that patients can book appointments based on doctor availability.

- **AC01** Authorized clinic staff can see doctors they are assigned to under V2 (`staff_members(user_id, doctor_id)`). This implements the linked PO tab's clinic-staff persona **without a physical `clinics` table**; Lead/PO must resolve the separate Google Doc tab describing doctor self-management.
- **AC02** Staff select doctor and input future appointment dates/time slots.
- **AC03** New slots are saved, not merely stored in browser state.
- **AC04** Staff slots are shown as available in US-02.
- **AC05** Booked slots appear unavailable on the staff dashboard.
- **AC06** Staff see confirmed appointments including patient name, doctor, date, time.

**Deliverables:** staff schedule-input form, persisted availability and synced booking status. Staff schedule GET/POST endpoints are **missing from API_CONTRACT_V2.md** and their authenticated DB write path/permissions are not yet defined; BE2 #32 + BE1 #31 + Lead #36 must close the gap before integration. Advanced editing, multi-role administration and patient cancellation/rescheduling are NOT part of the required 2-day MVP.

## Critical integration contracts

- **US-03 → US-02:** Staff-created available slot is visible to the patient; unavailable/overlapping slots must not be offered.
- **US-01 → US-02:** Suggested specialty filters the actual doctor catalog. No invented doctor/schedule data from the LLM.
- **US-02 → US-03:** V2 booking is stored as `requested` and **already makes the slot unavailable**. Authorized staff can subsequently change it to `confirmed`; the refreshed staff view must show the confirmed appointment for PO AC06. Confirm two-step acceptance with PO.
- **Minimum shared data:** specialty name/ID (logical catalog key), doctor ID/name/specialty, doctor/time/availability, appointment ID/patient name/phone/doctor/date/time, and chatbot specialty result. Physical database normalization is Tech Lead's choice.

## Outside the approved MVP

No diagnosis or treatment suggestions, custom clinical ML, EMR/EHR, hospital scheduling integration, payments, insurance, notifications, patient accounts, advanced authentication/roles, cancellation or rescheduling, predictive waiting times, advanced ranking or production-grade deployment/security certification.

Existing features outside scope may remain in code temporarily but must **not** block delivery. Do not label them P0. A runnable prototype or accessible demo is required, **not** production deployment.

## GitHub traceability

The PO's suggested tasks DEV-01 through DEV-09 are a *proposed decomposition*, not new user stories. See [ISSUE_MAPPING.md](ISSUE_MAPPING.md) for the **active TODAY-US2/US3** mapping and ownership; older issues were closed as superseded, not completed. Do not duplicate an existing task to match a suggested DEV number.

## Release decision

PO accepts the MVP only after the **dermatology appointment scenario** in [ACCEPTANCE_SCENARIO.md](ACCEPTANCE_SCENARIO.md) passes without critical failure. See [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).
