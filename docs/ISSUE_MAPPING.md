# PO Suggested DEV-01..09 → GitHub Issues

The PO's 9 suggested issues are examples of work breakdown, not another set of User Stories. Reuse existing GitHub issues; preserve 3 approved stories: US-01, US-02, US-03.

| PO task | Related US | GitHub issue(s) | Primary ownership |
| --- | --- | --- | --- |
| DEV-01 Project Setup & Sample Data | Shared | #16 (closed backbone), #2 (test data), #1 (scope) | Lead, BA 2 |
| DEV-02 Clinic Schedule Input UI | US-03 | #22 | UI 2 |
| DEV-03 Save & Retrieve Availability | US-03 | #21, #3 | Tech Lead / Backend |
| DEV-04 Chatbot Conversation Interface | US-01 | #18 | UI 1 |
| DEV-05 Specialty Suggestion & Safety | US-01 | #4 | Tech Lead / Backend |
| DEV-06 Doctor Selection & Slots UI | US-02 | #5, #7 | UI 1 and UI 2 |
| DEV-07 Booking & Duplicate Prevention | US-02 | #7, #3 | UI 2 and Tech Lead |
| DEV-08 Confirmed Clinic Appointments | US-03 | #8, #19 | UI 2 and QA |
| DEV-09 Integration, Bug Fixes & Demo | Shared | #9, #10, #13, #20 | QA, BA and Lead |

- **P0:** all 3 PO stories and required integration tests. Optional location filtering, visual polish and production deployment remain **P1**.
- **No task duplications:** UI 2's #22 owns the slot-entry form, while #8 owns the confirmed-appointments view. Backend #21 owns schedule persistence and contract. QA #19 proves slot sync.
- **Dependencies:** #21 → #22 / #7; #4 → #18 → #5 → #7; #7 → #8 / #19 → #10.
- Every issue must meet docs/DEFINITION_OF_DONE.md; P0 status is a priority, not evidence of completion.

## What changed from 2026-11-03

The earlier labels US-01..US-06 have been superseded. In the new PO scope:
- Former symptom-entry, review and doctor-suggestion stories are consolidated into new **US-01**.
- Former doctor-profile/booking stories map to new **US-02**.
- Former clinic booking view maps to new **US-03**; **staff ability to create slots is now mandatory**.
- Existing appointment cancellation/rescheduling, multi-state clinic workflows, detailed geography filters, and production Vercel are not needed to accept the PO MVP.

Source: PO Google Doc "SMART HOSPITAL PATIENT APPOINTMENT SYSTEM", sections 4, 6, 7 and 9.
