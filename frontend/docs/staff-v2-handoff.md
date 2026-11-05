# Staff appointments: integration handoff and PR evidence

Checked 2026-11-04. Scope: issues #8 and #5, PO US-03, especially AC06.
This is an FE component delivery, not certification that runtime or Supabase supports V2.

## Version evidence

- PO `docs/USER_STORIES.md`: US-03 AC01–AC06 remain mandatory. Existing business wording uses clinic membership; Lead/BA must reconcile it with doctor assignments without dropping the ACs.
- Target: `docs/DATA_DICTIONARY.md` and `docs/API_CONTRACT_V2.md` on main (design baseline identified by the task as `b0dc5f8`). Remote document blob hashes inspected: `ca9e1088c76bd428d86eec959a66354b8f1756a5` and `b6315e7fda98bc9e874baab906f0943be1f5bf97` respectively.
- Local checkout HEAD at review: `d91b51d`; no automatic pull, merge, migration or deployment performed.
- [PR #28 Backend](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/pull/28): merged, merge commit `240b9cd`. Booking returns requested, guarded by `BOOKING_RPC_V2_READY`; this is not proof that staff endpoints are V2.
- [PR #29 Database](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/pull/29): merged, merge commit `e32bc28`. Contains doctor membership/schema/RPC changes. Merge does not prove migrations were applied to live Supabase.
- [PR #30 Doctor List](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/pull/30): merged, merge commit `4bb3be2`. Changes patient navigation/layout. No edits to those files in this handoff.
- #27 booking is already in local ancestry via `7162895`. Preserve the FE2 booking journey.
- Remote main `backend/app/service.py`, blob `f63fa00249a3c8b92f1054d9fc825ccc748fe9ef`, still reads `staff_members.clinic_id`, filters appointments by slot clinic, and returns clinicName without slotId/doctorId. It also maps general auth failures to 401. These are unresolved backend V2 gaps.
- Live Supabase schema, membership mapping and RPC permissions: **not verified**; no connected Supabase inspection tool was available. No secrets were requested or recorded.

## Component boundary

Entry: `src/app/staff/confirmed-appointments.tsx`, CSS: `confirmed-appointments.module.css`.
Reuses `appointment-list.tsx`, `appointment-data.ts`, `staff-api.ts`, `staff-icon.tsx`, and `staff.module.css`.

```tsx
import { ConfirmedAppointments } from "./confirmed-appointments";

// FE2/Lead integrates only after runtime readiness and ownership agreement.
// Auth remains in the page. Read access_token from the Supabase SDK session.
<ConfirmedAppointments
  token={session.access_token}
  onSessionExpired={handleSessionExpired}
  allowConfirmation={true}
/>
```

`handleSessionExpired` belongs to the auth owner: refresh the session with the SDK or show sign-in, and update/remove the session passed to the component. No service-role key, passwords, local token storage or business Supabase queries belong in this component.

- Initial filter is Confirmed; All and each of the five statuses remain accessible.
- Pending confirmation is requested, never confirmed. The previously requested four KPI labels are retained.
- GET uses Bearer JWT, same-origin URL, no doctor ID query, and no cache. Backend alone enforces assignments. Client doctor filter is a convenience over returned rows, not authorization or an assigned-doctor catalog.
- Strict eight-field V2 response; rejects V1 rather than inventing IDs or silently accepting clinic-scoped data.
- Patient/doctor/date/time shown; time zone is Asia/Ho_Chi_Minh. Backend response order is preserved. Counts and local pagination refer only to the loaded maximum 100 records.
- Only requested → confirmed mutation. User explicitly confirmed Lead approval in this task. No cancellation/check-in/completion action is exposed.
- Successful PATCH triggers a fresh GET. 409/404 close stale details and reload. Ambiguous network failure does not auto-retry PATCH.
- 401/403 clear records, selections and patient-related search text; display distinct no-access screens. Changed session remounts the workspace. Raw server payloads and validation input are never rendered or logged.
- Empty, loading, service errors, malformed V2 and non-JSON responses are distinct states. API failures never fall back to samples.

`staff/page.tsx` was NOT changed during this handoff. It already contains uncommitted work from earlier turns; do not include that diff automatically in this component PR. Start/end SHA256: `F2DA211EDA1A134BC125EA27F2A2ABC94BBED836E6A367F0D1C6D368CC46EBE3`.
The new entry point is intentionally not mounted into the page pending FE2/Lead agreement. Existing schedule-manager is V1 and is not certified as V2.

## Required integration decisions and evidence

| Requirement | FE preparation | Remaining owner/evidence |
|---|---|---|
| AC01 assigned doctor access | Consume server-scoped V2 data, 401/403 screens | BE: doctor-scoped GET/PATCH, inactive doctor history, membership revocation; QA: staff A cannot read/update doctor B |
| AC02 doctor selection and future availability | Not implemented against an invented contract | Lead + BE: approve staff doctor and slot endpoint contract, then FE2 integrates |
| AC03 persistence | No browser-only slot creation introduced | BE/DB + QA: slot survives reload |
| AC04 patient sees created slot | Patient files untouched | FE2/QA: US-03 → US-02 integration |
| AC05 booked slot unavailable | All appointment statuses remain visible | Contract must define staff slot availability; QA verifies requested also reserves slot |
| AC06 confirmed patient/doctor/date/time | Confirmed initial view; requested → confirmed; reload | QA: real authorized test session, persistent booking and confirmation shown after refresh |

Gap 1: the task-approved confirm flow bridges requested → confirmed in FE, but BE/DB still must enforce V2 membership and atomic status changes. PO evidence must include the explicit confirmation step, not claim POST returned confirmed.

Gap 2: target API document still lacks GET `/api/staff/doctors`, GET `/api/staff/slots`, POST `/api/staff/slots`. Lead + BE must publish methods, field types, doctor scope, date/time validation, overlap behavior, availability semantics, sorting/limit and error responses before FE integrates. Existing V1 endpoints do not constitute that approval. A staff doctor with zero appointments cannot be discovered using the appointment list alone.

## Validation and PR evidence

- `node --test tests/staff-api.test.mjs`: 15 passing tests against the actual TS API module, mocked HTTP only. Covers all statuses/eight fields, V1 rejection, empty/limit, header-only JWT, missing session, 401/403/404/409/422/503, non-JSON, PATCH body/identity, terminal transitions, UTC date boundary.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: run for this handoff; record final results in the delivery note.
- Tests above do **not** prove backend authorization, React interaction behavior, live persistence or AC acceptance.
- Desktop/mobile screenshots and interaction recording: pending. Earlier Computer Use was stopped because it could not reliably determine the Windows browser URL; no fabricated screenshots are supplied.
- `/staff` remains a file-system route. Local layout still renders children. Verify direct navigation and the agreed staff navigation entry after FE2 integrates; do not overwrite the patient portal to add it.
- No PR posted, no deployment, no DB mutation. A named Dev Team reviewer and PO acceptance are still required; neither is claimed here.

## Live acceptance sequence

1. Lead/BE verify the actual Supabase schema and assigned-doctor memberships, and publish the availability contract.
2. Test staff A assigned doctor A, staff B assigned doctor B, and a valid user without membership. GET A must never include B, PATCH B with A token returns 403, missing/expired token returns 401. Verify no patient data remains visible after access loss.
3. Create a future slot via the agreed staff flow; reload, then select the same slot through US-01 → US-02. Book using synthetic patient data only. Verify requested is persisted and the slot becomes unavailable.
4. Refresh staff dashboard, switch to Pending confirmation, confirm, then select Confirmed. Verify patient name, doctor name, Vietnam date/time and persistent status after a full reload (AC06).
5. Exercise competing confirmations (409), 403, empty/loading, proxy HTML and network failure. Confirm no duplicate PATCH or fake success.
6. Capture desktop and mobile screenshots of Confirmed, pending details, no access and empty state; include only synthetic patient data. Recheck patient navigation and `/staff` after integration.
