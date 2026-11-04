# Shared Definition of Done — PO-Approved 2-Day MVP

**Authority:** Google Doc "SMART HOSPITAL PATIENT APPOINTMENT SYSTEM", sections 8–9 (2026-11-04). **Scope:** only US-01, US-02, US-03 in docs/USER_STORIES.md.

A User Story is Done only when:

- [ ] All of that story's agreed Acceptance Criteria are satisfied.
- [ ] Core functionality actually works in the shared demo environment.
- [ ] Required integration with other stories works (US-03 → US-02; US-01 → US-02; US-02 → US-03).
- [ ] Basic input validation and error handling are working.
- [ ] Implementation has received Dev Team review, including all AI-generated code/docs.
- [ ] No known critical defect blocks the main patient-to-clinic flow.
- [ ] The feature can be demonstrated to the Product Owner.

**Evidence:** Link issue → PR/commit → test result/demo evidence, including named reviewer for AI-assisted drafts. Passing CI alone is not acceptance. The PO retains the final acceptance decision; no automated system can grant this sign-off.

## Recommended engineering quality gates (not extra product scope)

- [ ] Frontend ESLint/TypeScript/build and backend Ruff/Pytest CI pass.
- [ ] Patient input, slot creation, duplicate booking, invalid booking and staff permission/error paths verified.
- [ ] Sample clinic/doctor/specialty data and slot status consistent after refresh; no fake booking success.
- [ ] Synthetic demo data only, no real medical histories, no publicly exposed backend keys.
- [ ] Demo works on desktop and a mobile-sized viewport.
- [ ] Release checklist contains names/links for reviewer and Product Owner sign-off.

**Do not mark the entire MVP Done merely because the codebase and mock tests pass.** Live Supabase integration (or another shared persistent demo DB) and the final dermatology scenario must still be verified.
