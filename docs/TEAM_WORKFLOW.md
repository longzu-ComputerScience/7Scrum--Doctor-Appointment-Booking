# 48-hour Sprint — Monorepo Teams

## Ownership

- Tech Lead: `backend/app/`, `supabase/`, API contracts, shared CI/deploy integration and PR review.
- UI 1: `frontend/src/app/page.tsx` and patient discovery/cards, filters, states.
- UI 2: `frontend/src/app/doctors/[id]/book/` and `frontend/src/app/staff/`, slot/booking UX and clinic dashboard.
- BA 1: product scope, patient+staff user stories, acceptance criteria and safety language.
- BA 2: data dictionary, test fixtures, synthetic seed catalog and demo scenario.
- QA: `backend/tests/`, API negative paths, DB concurrency proof, UI regression and release checklist.

## Branch and review rules

One issue → feature branch → PR. Tech Lead owns shared API/schema changes; UI commits must respect `docs/API_CONTRACT.md`. Do not push feature work directly to main. CI runs separate frontend/backend jobs for each PR.

**Frontend:** `cd frontend; npm ci; npm run lint; npx tsc --noEmit; npm run build`.

**Backend:** `cd backend; pip install -r requirements-dev.txt; pytest -q; ruff check .`.

## Milestones

H0–3: agree user journeys and API schema; H3–16: independent UI/backend work; H16–24: first real booking vertical slice; H24–32: clinic staff and AI fallback; H32–40: QA/regression/security; H40–48: deployment and demo buffer. Include breaks.

## Definition of Done

Validated requirements; CI green; no release-blocking defects; genuine appointment stored via Supabase; double booking fails for one of two simultaneous requests; staff role enforced by backend; frontend handles loading, empty, 409, 401/403 and 503 states. Do not call a mock/demo booking successful.
