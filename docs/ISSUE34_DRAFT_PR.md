# Prepared Draft Pull Request

**Suggested title:** `feat(frontend): hand off weekly schedule editor and V2 booking`

**Source branch:** `feat/staff-schedule-ui`
**State when opened:** Draft
**Status:** local description updated for the user-approved normal integration of origin/frontend_dev into feat/staff-schedule-ui. The PR remains a component/integration handoff; no PR merge into frontend_dev or main is performed.

---

## Linked issue and story

Refs #34

FE2 weekly schedule editor and Patient booking calendar, coordinated with FE1 #33, BE1 #31, BE2 #32 and QA #35. This is a component handoff; full application integration remains pending.

## Summary

The legacy manual Staff slot screen does not satisfy the recurring schedule flow. This change supplies a reusable weekday/multiple-interval editor and an API-backed Doctor schedule component, and upgrades the existing Patient booking modal to the V2 contract. The candidate now retains frontend_dev's real homepage/catalog/Sidebar/modal-slot wiring. FE1 must still provide actual authentication and mount the Doctor editors.

- Export controlled WeeklyScheduleEditor props, interval validation and DoctorScheduleEditor integration with future effectiveDate, Bearer JWT and structured 409 conflicts.
- Keep the existing booking popup and confirmation presentation; read server-generated 30-minute slots in a bounded Vietnam date window and use Doctor address/district.
- Add Patient session/profile handoff, authenticated booking, safe errors, duplicate-submit/uncertain-result protection and availability refetch with a realtime subscription interface.
- Extract shared timezone utilities into a neutral lib module. Remove local preview routes and obsolete Staff adapters/styles/tests from application source; preserve local backups/evidence in ignored output/.
- Document the exact FE1 mounts, homepage/Sidebar/root @booking wiring and remaining backend/realtime work in `docs/ISSUE34_FE1_HANDOFF.md`.

The working-tree reconciliation retains incoming FE1 homepage, Sidebar, catalog and Staff screens. The original frontend_dev worktree and backend/schema files are untouched. No fake booking or persistence response is introduced in production.

## Acceptance & Definition of Done

- [ ] Full Issue #34 acceptance criteria are met and evidenced — application mounts and real E2E pending
- [x] Basic validation and safe error branches covered by focused unit tests
- [ ] Complete application desktop/mobile flow verified — prior isolated editor/mobile and real popup error checks only
- [x] No secrets or real patient data introduced
- [ ] AI-assisted draft/code/test/document explicitly confirmed by a named Dev Team member
- [ ] No release-blocking integration gaps — keep Draft until dependencies below are resolved

## Verification

All required frontend checks passed after cleanup. The combined suite now contains 40 tests: the 22 V2/time tests, 15 incoming Staff API tests and three display/reconciliation regressions.

- [x] `npm test` — 40/40 pass
- [x] `npm run lint` — pass
- [x] `npm run typecheck` (`next typegen && tsc --noEmit`) — pass
- [x] `npm run build` — pass
- [x] Production route manifest contains no preview/review route; preview source is outside the frontend tree
- [ ] Supabase integration, authenticated booking contention and persistence verified

Backend checks are not part of this frontend-only change. Unit HTTP stubs are isolated inputs, not evidence of live API or database success. Earlier screenshots of the local preview are not evidence of complete Carely application integration.

**Human AI-draft reviewer (name or GitHub handle):** The requesting user approved the conflict-resolution candidate in Codex. Named GitHub reviewer attribution remains to be recorded in the PR.

**Review evidence (link/comment):** Pending actual Draft PR review and QA #35 evidence.

**Known limitations / remaining QA:**

- FE1 must mount WeeklyScheduleEditor in invitation Registration and DoctorScheduleEditor in the Doctor-only Dashboard. Neither is mounted in an application screen in this branch.
- Preserve frontend_dev's PatientShell/Sidebar/API-backed DoctorBrowser and its navigation/demo affordances during targeted integration. The integrated implementation now uses the incoming UUID catalog, homepage and root @booking slot. V2 booking logic is combined with the incoming back navigation, demo hints and display normalization; the requesting user reviewed and approved this reconciliation before its normal merge finalization.
- BookingSessionProvider must wrap both direct and intercepted booking surfaces, with actual Patient session/profile/login navigation. The homepage-to-booking routing is now wired in the integrated implementation, but authenticated/persistent E2E remains unverified.
- BE1/BE2 must supply compatible recurring schedule/profile APIs, generated 30-minute availability, JWT-verified atomic 201 confirmed booking/reference, conflict rejection and transactional notifications; valid test accounts are required for persistence/authorization/concurrency E2E.
- The realtime interface/refetch fallback is implemented, but event transport/payload/scoping/reconnect delivery is not wired. Public availability does not prove why a slot disappeared; the UI labels it unavailable rather than inventing occupied appointments.
- The newer frontend_dev shell is preserved through the approved normal merge into feat/staff-schedule-ui. No force push or PR merge into frontend_dev/main is performed; component checks do not establish PO acceptance or deployment.

Browser follow-up: the reconciled production Dashboard/catalog and Sidebar were inspected with the actual demo public API. A pathname guard hides stale intercepted dialog content; homepage section changes use Next router navigation to preserve popup history. Fresh-entry Dashboard → Doctor Browser → popup → Close, reopen → browser Back, and restored scrolling/focus passed on the production build. Earlier mobile drawer checks also passed. All 40 unit tests, ESLint, typecheck and production build passed after the history fix. The legacy Doctor detail response remains incompatible with strict V2 booking; no live booking or persistence success is claimed.
