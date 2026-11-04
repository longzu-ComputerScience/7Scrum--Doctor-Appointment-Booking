# Prepared Draft Pull Request

**Suggested title:** `feat(frontend): hand off weekly schedule editor and V2 booking`

**Source branch:** `feat/staff-schedule-ui`
**State when opened:** Draft
**Status:** description prepared locally; no PR has been created and no commit/push has been performed.

---

## Linked issue and story

Refs #34

FE2 weekly schedule editor and Patient booking calendar, coordinated with FE1 #33, BE1 #31, BE2 #32 and QA #35. This is a component handoff; full application integration remains pending.

## Summary

The legacy manual Staff slot screen does not satisfy the recurring schedule flow. This change supplies a reusable weekday/multiple-interval editor and an API-backed Doctor schedule component, and upgrades the existing Patient booking modal to the V2 contract. The current homepage still needs FE1's real catalog/auth/modal connection before users can complete that flow.

- Export controlled WeeklyScheduleEditor props, interval validation and DoctorScheduleEditor integration with future effectiveDate, Bearer JWT and structured 409 conflicts.
- Keep the existing booking popup and confirmation presentation; read server-generated 30-minute slots in a bounded Vietnam date window and use Doctor address/district.
- Add Patient session/profile handoff, authenticated booking, safe errors, duplicate-submit/uncertain-result protection and availability refetch with a realtime subscription interface.
- Extract shared timezone utilities into a neutral lib module. Remove local preview routes and obsolete Staff adapters/styles/tests from application source; preserve local backups/evidence in ignored output/.
- Document the exact FE1 mounts, homepage/Sidebar/root @booking wiring and remaining backend/realtime work in `docs/ISSUE34_FE1_HANDOFF.md`.

No FE1 owner screens, Sidebar, backend/schema or separate frontend_dev worktree are changed. No fake booking or persistence response is introduced in production.

## Acceptance & Definition of Done

- [ ] Full Issue #34 acceptance criteria are met and evidenced — application mounts and real E2E pending
- [x] Basic validation and safe error branches covered by focused unit tests
- [ ] Complete application desktop/mobile flow verified — prior isolated editor/mobile and real popup error checks only
- [x] No secrets or real patient data introduced
- [ ] AI-assisted draft/code/test/document explicitly confirmed by a named Dev Team member
- [ ] No release-blocking integration gaps — keep Draft until dependencies below are resolved

## Verification

All required frontend checks passed after cleanup. The suite now contains 22 focused tests: obsolete manual Staff tests were archived and shared timezone coverage was retained in the V2 suite.

- [x] `npm test` — 22/22 pass
- [x] `npm run lint` — pass
- [x] `npm run typecheck` (`next typegen && tsc --noEmit`) — pass
- [x] `npm run build` — pass
- [x] Production route manifest contains no preview/review route; preview source is outside the frontend tree
- [ ] Supabase integration, authenticated booking contention and persistence verified

Backend checks are not part of this frontend-only change. Unit HTTP stubs are isolated inputs, not evidence of live API or database success. Earlier screenshots of the local preview are not evidence of complete Carely application integration.

**Human AI-draft reviewer (name or GitHub handle):** Pending team assignment; no human approval claimed.

**Review evidence (link/comment):** Pending actual Draft PR review and QA #35 evidence.

**Known limitations / remaining QA:**

- FE1 must mount WeeklyScheduleEditor in invitation Registration and DoctorScheduleEditor in the Doctor-only Dashboard. Neither is mounted in an application screen in this branch.
- Preserve frontend_dev's PatientShell/Sidebar/API-backed DoctorBrowser and its navigation/demo affordances during targeted integration. This worktree's older homepage still contains the prototype BookingView/local confirmation, and its root layout omits @booking. FE1 must connect real UUID booking navigation and render both children and the booking slot.
- BookingSessionProvider must wrap both direct and intercepted booking surfaces, with actual Patient session/profile/login navigation. The standalone booking route is wired, but the complete homepage-to-booking experience is not.
- BE1/BE2 must supply compatible recurring schedule/profile APIs, generated 30-minute availability, JWT-verified atomic 201 confirmed booking/reference, conflict rejection and transactional notifications; valid test accounts are required for persistence/authorization/concurrency E2E.
- The realtime interface/refetch fallback is implemented, but event transport/payload/scoping/reconnect delivery is not wired. Public availability does not prove why a slot disappeared; the UI labels it unavailable rather than inventing occupied appointments.
- No upstream merge/rebase or clean integration against the newer frontend_dev shell has been performed. Component checks do not establish PO acceptance or deployment.
