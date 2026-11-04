# PO Release / Sprint Review Checklist

**Current status: NOT ACCEPTED — shared live database and complete E2E evidence pending.**

**Latest PO spec:** [SMART HOSPITAL PATIENT APPOINTMENT SYSTEM](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit), sections 1–10.

| Gate | Evidence | State |
| --- | --- | --- |
| 3 US/AC and 2-day plan reflected in repo | docs/USER_STORIES.md, docs/SPRINT_PLAN.md | Documented |
| Controlled follow-up chat and specialty navigation | backend/app/consult.py; frontend/src/app/consultation.tsx | Code implemented; QA pending |
| Clinic staff input/saved slots | backend/app/service.py + frontend staff schedule component | Code implemented; real DB test pending |
| Auto-confirm and slot conflict constraints | supabase/migrations/001 + 002; booking RPC | Requires live migration and concurrency test |
| Clinic booking list and booked availability status | FastAPI staff endpoints + UI | Requires E2E verification |
| Frontend + backend CI | Linked GitHub Actions run on current main | Must verify after merge |
| Six-step PO dermatology scenario | docs/ACCEPTANCE_SCENARIO.md | NOT TESTED |
| Human review of AI-generated code/drafts | Named Dev Team reviewer + PR approval | Pending |
| PO Sprint Review | PO decision after end-to-end demo | Pending |

## Handover / Sign-off

- Shared Supabase demo project (do **not** paste secrets):
- Test staff account belongs to fictional clinic:
- Applied migrations (001 + 002):
- Runnable prototype/demo URL or local setup:
- CI run:
- All 3 US acceptance checklists:
- Critical defects:
- Named Dev Team code reviewer:
- PO demo date/feedback:
- PO decision (accepted / changes requested):

**Production Vercel deployment is optional**, not a PO release gate. A reproducible locally runnable demo is acceptable.
