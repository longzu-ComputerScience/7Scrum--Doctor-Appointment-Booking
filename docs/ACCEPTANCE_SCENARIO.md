# PO Final Acceptance — Dermatology Appointment

**Reference:** PO Google Doc, section 9. **Status:** NOT YET VERIFIED.

Use fictional data only. Prepare a Supabase demo project with migration 001 + migration 002, synthetic dermatologist and clinic staff test user. Two services (Next.js + FastAPI) should run with the same Supabase project.

| Step | Actor | Action | Required evidence |
| --- | --- | --- | --- |
| 1 | Clinic staff | Select dermatologist; create a future date/time slot | Slot is persisted and appears in US-02 |
| 2 | Patient | Enter a supported skin-rash symptom in chat | One basic follow-up question appears; Dermatology is suggested; no diagnosis |
| 3 | Patient | Continue to doctor selection | A matching dermatologist and available slot are displayed |
| 4 | Patient | Select slot, enter name/phone and confirm | Saved appointment has confirmed status and booking reference |
| 5 | Patient | Refresh/revisit selected doctor/slot | Booked slot is no longer available, repeated attempt conflicts |
| 6 | Clinic staff | Refresh appointments/slot list | Confirmed booking shown with correct patient, doctor, date and time; slot marked booked |

## PO Sign-off

- Demo date / environment:
- Patient & staff test evidence:
- CI run:
- Dev Team code review:
- Critical bugs:
- Product Owner decision (accepted / changes requested):
- PO name / feedback:

The six-step scenario and all 3 User Story acceptance criteria determine success; Vercel production deployment is not mandatory.
