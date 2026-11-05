# Production configuration: Vercel Next.js + Render FastAPI + Supabase

This document records the **two separate Vercel projects** attached to the
same 7Scrum Git repository (checked on 2026-11-05). The user reports the
Vercel–Render–Supabase path is working. Do not disrupt it to remove legacy
configuration.

## Current deployments

| Vercel project | Framework | Production domain / role |
| --- | --- | --- |
| `7-scrum` | Next.js | `https://7-scrum.vercel.app` — frontend-only target |
| `7scrum--doctor-appointment-booking` | Services | `https://7scrum-doctor-appointment-booking-sage.vercel.app` — legacy multi-service deployment |

The new `7-scrum` project's Vercel environment **lists**
`BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` for both Production and Preview. Their
values and actual API responses were **not independently verified**.
`BACKEND_URL` must be the Render service's HTTPS **origin**, without `/api`.

The repository's root `vercel.json` still configures the **legacy Services**
project; it is intentionally **preserved**. The Next.js project should
use `frontend/` as its Vercel Root Directory so that file is outside its
configuration scope. Confirm the Root Directory in the Vercel dashboard:
the project inspection API did not expose that setting.

## Frontend-only data flow

```text
Browser -> Vercel Next.js (frontend/)
           | /api/* via next.config.ts using BACKEND_URL
           v
           Render FastAPI (backend/)
           |
           v
           Supabase (Auth / PostgreSQL / RPC)
```

- Keep frontend calls relative (`/api/...`); do not hard-code the Render
  hostname inside application components.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe
  browser credentials (subject to Supabase RLS policies).
- Only Render should need `SUPABASE_SERVICE_ROLE_KEY`. Never put this secret
  in frontend code or a `NEXT_PUBLIC_*` variable.
- `frontend/next.config.ts` accepts localhost for local development/CI, but
  **fails Vercel Production builds** when `BACKEND_URL` is missing, is not an
  origin, or is not HTTPS. A failed build should not replace an existing
  ready production deployment.

## Verification before approving configuration changes

1. Check `7-scrum` Vercel project **Root Directory = frontend** and
   **Framework = Next.js**. Keep `main` as Production Branch.
2. Confirm that `BACKEND_URL` points to the real Render HTTPS origin (no
   `/api` suffix), not a placeholder or a localhost address.
3. At the Render URL, `GET /api/health` must return HTTP 200 with
   `databaseConfigured: true`. This checks only env presence, not DB access.
4. At `https://7-scrum.vercel.app/api/doctors`, check HTTP 200 with
   `demoMode: false` and expected catalog records. This establishes a
   successful backend catalog query when routed through Render.
5. Exercise Patient/Doctor login, calendar, booking confirmation/409 conflict,
   notifications and role isolation before calling the end-to-end flow done.
6. Review GitHub Actions CI and the new `7-scrum` Vercel Preview deployment.
   An unrelated **legacy Services** preview failure must be investigated
   separately, not confused with the new Next.js project status.

## Legacy project and old domain

Do **not** remove the root `vercel.json`, switch framework settings on the
legacy project, delete its secrets or move the old
`7scrum-doctor-appointment-booking-sage.vercel.app` domain as part of this
configuration-only change. Domain migration or legacy project retirement
requires an explicit separate cutover after verification.

## Rollback

For the new Next.js project, retain its previous READY Production deployment
and promote/restore it if a new deploy fails. Revert the change in
`frontend/next.config.ts` if needed. Do not alter the Render database,
Supabase keys or the separate legacy Services project to roll back a
frontend config change.
