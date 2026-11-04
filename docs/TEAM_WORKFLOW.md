# 7Scrum — current team handoff (US-02 → US-03, V2 target)

**PO authority:** [SMART HOSPITAL PATIENT APPOINTMENT SYSTEM, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). **Target technical references:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). See [DOCS_GUIDE.md](DOCS_GUIDE.md) for V1 runtime versus V2 target and unresolved PO decisions.

## Work boundaries — 2 Backend + 2 Frontend + Tester + Lead

- **BE1 (#3 → #31):** `supabase/`, inspect live DB, design/apply *separate* V1→V2 migration with backup and audit, DB constraints/RPC, doctor-based membership; coordinate SQL changes with BE2.
- **BE2 (#26 → #32):** `backend/app/main.py`, `service.py`, `schemas.py`, real doctor/booking and staff endpoints, JWT authorization by doctor; propose missing V2 staff-schedule contract with Lead. Do not edit BE1 SQL independently.
- **FE1 (#5 → #33):** patient doctor discovery handoff plus staff confirmed-appointments component. Coordinate the shared `staff/page.tsx` and layout with FE2/Lead; do not show fictitious booking success.
- **FE2 (#7/PR #27 → #34):** patient booking route already merged; build staff schedule creation/availability UI, real API integration and error states. Coordinate staff page edits with FE1.
- **Tester (#9 → #35):** `backend/tests/` and QA evidence; validate US-02/US-03 cross-interface data, concurrency, authorization, timezone and the dermatology scenario against the shared DB.
- **Lead (#25 → #36):** maintain PO scope, V2 contract alignment, resolve role/status/API gaps, review/merge PRs, ensure US-01 continuation and obtain PO acceptance. No BA positions are assigned in the current six-person execution board.

**Dependency:** Staff-created published slot (US-03) → real patient slot/booking (US-02) → staff sees the booking and, after confirmation, its `confirmed` status. V2 initial booking status is `requested` (not immediate confirmed). Product acceptance wording awaits Lead/PO agreement; see [DOCS_GUIDE.md](DOCS_GUIDE.md).

## Git and contract protocol

- Before coding, read [USER_STORIES.md](USER_STORIES.md), [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md) and the assigned TODAY issue. [API_CONTRACT.md](API_CONTRACT.md) is retained as a **V1 implementation reference only**.
- One focused issue/branch/PR where practical; keep US-02 fixes separate from US-03 features. Coordinate ownership before editing shared FE/backend files. Don't assume a merged UI/BE PR means the full workflow was tested.
- Service-role/AI secrets must stay backend-only; use fictional demo data, never real patient information.
- FE checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`. BE checks: `python -m ruff check .`, `python -m pytest -q`; run live DB integration separately.
- Review AI-assisted code/docs with a named human developer. CI success is not PO acceptance.

## Release

Use [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md), [ACCEPTANCE_SCENARIO.md](ACCEPTANCE_SCENARIO.md), and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The demo must exercise US-01/US-02/US-03 with one shared persistent database and actual staff authorization; deployment to production is optional.
