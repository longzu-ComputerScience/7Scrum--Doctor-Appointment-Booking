# Two-Day Sprint — Team Workflow

## Ownership
- Tech Lead: architecture, Supabase, AI integration, API contracts, CI and review.
- UI Developer 1: patient search, doctor cards, responsive behavior and error states.
- UI Developer 2: doctor booking, appointment form and clinic dashboard.
- BA 1: workflow, requirements, P0/P1 backlog and acceptance criteria.
- BA 2: data dictionary, synthetic doctors/clinics/slots and demo script.
- Tester: test plan, concurrent bookings, API negative paths, accessibility and regression.

## Branches / PRs
Each issue gets a feature branch from main (e.g. feat/issue-5-doctor-search).
Open one PR per issue, link the issue, explain changes and attach screenshots when relevant.
Review against acceptance criteria; avoid direct feature pushes to main.
Never commit secrets or patient data. Rebase/fetch latest main before integration.

## 48-hour checkpoints (elapsed time, include breaks)
H0–3: approve user flow, database schema and API contract.
H3–16: implementation by UI/Tech Lead in parallel; BA prepare seed/demo; QA prepare tests.
H16–24: first vertical slice, search -> doctor -> slot -> booking in Supabase.
H24–32: clinic staff status update, AI fallback, refinements.
H32–40: regression, conflict/security testing.
H40–48: Vercel deployment, demo rehearsal and buffer.

## Done
- acceptance criteria checked,
- no high-severity open bugs,
- npm run lint, npx tsc --noEmit and npm run build pass,
- appointment stored in Supabase; double booking blocked,
- staff membership enforced server-side,
- UX includes loading/empty/error states.
