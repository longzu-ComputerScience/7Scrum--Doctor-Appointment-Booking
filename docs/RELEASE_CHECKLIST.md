# PO release / Sprint Review checklist — V2 target

**Status: NOT ACCEPTED / NOT VERIFIED.** No live DB migration, integration E2E or PO sign-off is implied by these docs.

**Product requirements:** [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). **Technical baseline/target:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). [API_CONTRACT.md](API_CONTRACT.md) is historical **V1**; refer to [DOCS_GUIDE.md](DOCS_GUIDE.md) for conflicts and decisions.

| Gate | Evidence required | State |
| --- | --- | --- |
| PO 3 stories, scope and current six-person allocation | USER_STORIES / ISSUE_MAPPING / active TODAY issues | Documented; PO role/status clarifications pending |
| API and data model version aligned across app | Real request/response, V2 fields, staff endpoints, no clinic/room | Pending verification |
| Shared Supabase state verified | Schema inspection, backup, actual applied migration, constraints and synthetic seed | Pending (schema_v2.sql is **new DB bootstrap**, not upgrade) |
| Staff schedule input and permission | Doctor-scoped JWT; real GET/POST staff slots, persistence, overlap 409 | Pending |
| Booking persisted and unavailable afterwards | HTTP 201 **requested**, real slot, 1×201/1×409 race, refresh | Pending |
| Staff appointment status | GET staff appointments, `requested → confirmed` PATCH, correct patient/date/time | Pending; PO confirmation-flow decision |
| US-01 follow-up, specialty and urgent behavior | True chatbot/controlled fallback, no invented doctor/slot | Pending |
| Frontend/backend PR checks | Lint/typecheck/build/test run on exact integrated commit | Verify current HEAD |
| Six-step Dermatology scenario | ACCEPTANCE_SCENARIO evidence on same DB | NOT TESTED |
| Human review of AI-generated work | Named Dev Team reviewer and PR approval | Pending |
| PO Sprint Review | Explicit PO review and acceptance decision | Pending |

## Handover / sign-off

- Tested `main` commit / PR references:
- API version and actual DB schema/migration/rollback readiness:
- Shared Supabase demo project (no keys shared):
- Synthetic staff user + assigned doctor IDs (no tokens):
- Staff slot API and authenticated write-path evidence:
- E2E/screenshots/race/negative cases:
- CI run and named Dev Team reviewer:
- PO clarification of clinic staff vs doctor actor; requested vs confirmed:
- Critical defects and owners:
- PO name, date, feedback and decision:

**Production deployment is optional.** A reproducible working demo with all agreed AC and no critical blocker is the release gate.
