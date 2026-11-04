# Shared Definition of Done — PO-Approved 2-Day MVP

**Product authority:** [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8), sections 8–9 (2026-11-04). **Target tech:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql); unresolved mismatches in [DOCS_GUIDE.md](DOCS_GUIDE.md). **Scope:** US-01, US-02, US-03.

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
- [ ] Patient input, staff-created slot persisted, duplicate booking (201/409), invalid booking, doctor-scoped staff permission/error paths verified. V2 initial status `requested` must not be shown as `confirmed` without a real staff transition.
- [ ] Fictional doctor/specialty data, assigned staff access and slot status consistent after refresh; no fake booking success. V2 schema has no `clinics`/`rooms` tables.
- [ ] Synthetic demo data only, no real medical histories, no publicly exposed backend keys.
- [ ] Demo works on desktop and a mobile-sized viewport.
- [ ] Release checklist contains names/links for reviewer and Product Owner sign-off.

**Do not mark the MVP Done merely because code or mock tests pass.** Verify the **actual V2 migration/runtime state** (schema_v2 is new-DB bootstrap, not an upgrade), live shared database, staff schedule write authorization and final dermatology scenario. Obtain explicit Lead/PO decisions on clinic-staff versus doctor persona and the requested→confirmed demo.
