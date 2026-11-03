# Definition of Done (DoD) — 7Scrum 48-hour MVP

**Owner:** Tech Lead + QA. **Approval:** Product Owner (PO). **Applies to:** every P0 user story and the end-to-end MVP release.

This checklist is based on the team's handwritten DoD (2026-11-03). The crossed-out candidates "Functional completeness" and "Symptom & specialty triage" are **not** treated as standalone DoD bullets. The symptom stories remain in the product backlog and must meet their own acceptance criteria if committed to the sprint.

## Team DoD (mandatory)

- [ ] **Doctor & slot filtering:** users can discover verified doctor+clinic records and see available time slots through the FastAPI-backed UI; only database-backed results are presented as bookable.
- [ ] **Demo readiness:** an end-to-end walkthrough can be demonstrated, from patient input/search through doctor choice and a real appointment record to clinic staff management. The team has a reproducible demo dataset and fallback when the AI provider is unavailable.
- [ ] **User-story acceptance criteria:** every P0 story has explicit, testable acceptance criteria and demonstrable evidence. No issue is marked Done solely because code exists.
- [ ] **Basic input validation and error handling:** required fields, invalid values, empty results, inaccessible APIs, unauthorized staff, occupied slots and AI failure have understandable error states. A duplicate slot request must not create a second active booking.
- [ ] **Desktop and mobile usability:** the public workflow and staff flow are usable on desktop and mobile (QA records at least 375px and desktop viewport checks).
- [ ] **MVP demonstrated to PO:** the Product Owner observes the working MVP and explicitly accepts the agreed scope. Record date, feedback and decision in `docs/RELEASE_CHECKLIST.md` or the release issue; do not assume acceptance.
- [ ] **AI-generated drafts are reviewed:** every AI-generated code/document/test/backlog draft used in the release is reviewed and explicitly confirmed by a **named Dev Team member**. Record reviewer and evidence (PR review, issue comment or checklist). AI output is not automatically approved.

## Engineering release gates (measurable evidence)

- [ ] Frontend CI: `npm ci`, ESLint, TypeScript and production build pass.
- [ ] Backend CI: Ruff and Pytest pass; tests cover critical API errors and safety fallback.
- [ ] GitHub PR review completed, conflicts resolved, no unreviewed direct release changes.
- [ ] Supabase integration tested with synthetic data: booking persistence, unique slot contention, clinic-scoped staff authorization and permitted status transitions.
- [ ] Environment separation verified: `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` remain only in the FastAPI server environment; no secrets in Git.
- [ ] Both Vercel services work in the target environment: `frontend/` Next.js proxies `/api/*` to `backend/` FastAPI, including staff JWT forwarding.
- [ ] QA has no unresolved blocking or critical defects for the committed release scope.
- [ ] Real patient records are not used for the sprint demo; no medical diagnosis or unsupported urgent-symptom advice is presented.

## Evidence and sign-off

For each story include: a linked GitHub Issue + PR, checklist of acceptance criteria, test/build result, and a brief screenshot, API response, or demo note. A **named human reviewer** must explicitly approve AI-assisted material.

Release decision is **not** inferred from passing CI. See `docs/RELEASE_CHECKLIST.md` for currently unverified gates. The release remains *Not approved* until PO confirmation and required integration evidence are recorded.
