# Production deployment: Vercel frontend + Render backend

This is a **staged cutover checklist**. Do not merge the accompanying
frontend-only configuration PR until the Render URL and Vercel project settings
have been verified. No application source tree or API contracts are changed.

## Architecture

- **Vercel:** Next.js from `frontend/`; public Patient/Doctor UI and Supabase
  browser Auth (anon key only).
- **Render:** FastAPI from `backend/`; server-side Supabase access, booking and
  consultation endpoints.
- **Supabase:** shared Auth/PostgreSQL. Never expose the service-role key to
  the browser or Next.js client bundle.
- **API:** frontend uses same-origin `/api/*`. The Next.js rewrite in
  `frontend/next.config.ts` forwards it to `BACKEND_URL/api/*`.

## Prerequisites (before merging)

1. Verify the **real** HTTPS Render service origin. Do not use an example URL
   or append `/api`. On Render, set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` as secrets. Typical Render settings:
   root `backend`, build `pip install -r requirements.txt`, start
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. On the Render origin, check `GET /api/health` returns 200 with
   `databaseConfigured: true`, then `GET /api/doctors` returns 200 with
   `demoMode: false` and the expected catalog. Health checks for configured
   environment variables, **not** a successful database query.
3. In the **existing Vercel project**, configure Production env vars:
   - `BACKEND_URL` = actual Render **HTTPS origin** (no `/api` suffix);
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Set a separate safe Preview backend if previews must exercise live APIs.
   Do not connect unreviewed Preview code to production patient data.
4. Coordinate the cutover to **Framework Preset: Next.js** and **Root Directory:
   `frontend`** (Production Branch: `main`). The previous root
   `vercel.json` defined Vercel Services, so a dashboard-only or code-only
   change is insufficient. Make the settings change and merge together, then
   deploy from `main`. Keep the previous production deployment available for
   rollback.
5. Only **after** confirming that Vercel is frontend-only, remove
   `SUPABASE_SERVICE_ROLE_KEY` and server-side `SUPABASE_URL` from Vercel if
   they are no longer required. Both belong on Render in the target design.

## Smoke tests after the cutover

1. Existing public domain loads the Next.js homepage.
2. Public domain `/api/health` returns 200 and
   `databaseConfigured: true` via Render (not localhost/Vercel FastAPI).
3. Public domain `/api/doctors` returns `demoMode: false` and correct doctors.
4. Patient/Doctor authentication, authorized requests, 30-minute calendar,
   booking confirmation/409 conflict and notifications work with the same DB.
5. Verify Render runtime logs and Vercel deployment logs for errors; do not
   mark E2E passing solely on `READY` status.

## Rollback

If the frontend-only deployment fails, restore the previous Vercel Production
deployment and its matching **Services** framework/root settings and the old
`vercel.json` from git. Do not delete Render or rotate Supabase keys as a
first response. Keep the known-working production deployment available until
the smoke tests pass.

**Important:** the deployment URL and actual environment variable values are
managed in Vercel/Render dashboards, not committed to GitHub.
