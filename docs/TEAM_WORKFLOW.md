# 7Scrum — Two-Day Developer Handoff

**Product source:** PO Google Doc "SMART HOSPITAL PATIENT APPOINTMENT SYSTEM" (2026-11-04). The 3 approved stories are in docs/USER_STORIES.md. See docs/SPRINT_PLAN.md for the Day 1/Day 2 sequence and docs/ISSUE_MAPPING.md for mapping to live GitHub issues.

## Work boundaries

- **Tech Lead / Backend** — \`backend/app/\`, \`supabase/\`, API contract, atomic booking, clinic-scoped schedule storage, data integration, code review. Deploy/preview setup only as needed for runnable demo.
- **UI 1** — \`frontend/src/app/consultation.tsx\` chatbot follow-up, doctor/specialty filter and recommendation list in \`frontend/src/app/page.tsx\`; no backend implementation or AI API key on client.
- **UI 2** — \`frontend/src/app/staff/\` clinic schedule entry & confirmed bookings and \`frontend/src/app/doctors/[id]/book/\` doctor slots/booking form.
- **BA 1** — PO stories, Acceptance Criteria, scope and sign-off; **BA 2** — synthetic doctors/specialties/slots, demo evidence.
- **Tester / QA** — \`backend/tests/\` negative paths and live booking concurrency; 6-step dermatology E2E scenario and defect tracking.

**Dependency order:** Staff availability US-03 → patient booking US-02. Start this on Day 1; chatbot US-01 should connect specialty to US-02, not create fictitious doctors.

## Git protocol

- Read docs/USER_STORIES.md and docs/API_CONTRACT.md before implementation.
- One issue → one short-lived branch → PR against \`main\`; avoid two developers editing the same file without coordinating.
- Reviewer must explicitly approve AI-generated drafts/code. PO approves product scope/acceptance, not individual code changes.
- Do not commit \`.env\` files or real patient data.
- Frontend CI: \`cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build\`.
- Backend CI: \`cd backend && pip install -r requirements-dev.txt && python -m ruff check . && python -m pytest -q\`.

## Shared DoD / release

See docs/DEFINITION_OF_DONE.md and docs/ACCEPTANCE_SCENARIO.md. The PO accepts only a functioning 6-step dermatology booking demo with **all 3** approved User Stories; a green CI build or static mock page does not imply acceptance.
