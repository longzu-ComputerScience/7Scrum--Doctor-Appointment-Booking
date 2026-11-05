# 7Scrum PR #63 — no Supabase changes

This branch updates frontend and FastAPI while leaving existing Supabase database, schema, RLS and Storage unchanged. Do not run any migration for this PR.

## Existing-database functionality

- Specialist dropdown and doctor keyword/district filtering; Doctor Registration specialty dropdown comes from the active doctor catalog.
- Patient My Appointments uses JWT-backed GET /api/patient/appointments to read existing appointments and doctors data. This uses the columns from the existing recurring-booking system (005); no new table or policy.
- Session persistence uses existing Supabase Auth browser storage with automatic token refresh.
- Admin login and read-only doctor directory at /admin, using the existing doctors table. /staff redirects to /admin.
- Browser-only avatar preview (no upload, no DB column, no Storage bucket). Reverts on a full page reload.
- Home/login/register motion polish and emphasized chat launcher, honoring reduced-motion settings.

## Admin setup: Render configuration only

Admin access is fail-closed and requires a backend environment variable:

ADMIN_USER_IDS=<existing-Supabase-Auth-user-UUID>

Use comma-separated Auth user UUIDs if multiple admins are required. The backend verifies the bearer token using Supabase Auth and compares the authenticated immutable user ID to this allowlist; it does not trust role, email or user metadata from the browser. No new Supabase user or table is created. Remove the variable to disable admin access.

The Admin directory is read-only. The existing doctor table contains an active flag but does not contain durable application history and review permissions. This PR does not promise Approve/Reject. Inactive doctors are labeled inactive, not pending approval. Approval needs a separately agreed persistent workflow.

## Deployment/testing

1. No Supabase actions required. No SQL migration is included in this PR.
2. Preview frontend may require a matching backend Preview/staging deployment for /api/patient/appointments and /api/admin/doctors.
3. To enable read-only Admin, set ADMIN_USER_IDS on Render and redeploy the backend. No Supabase environment variable changes are required.
4. Verify frontend lint/typecheck/build, backend Ruff/pytest, and a Patient booking followed by My Appointments fetch.

## Limitations

- Doctor Registration follows the existing 007_doctor_profile_registration.sql contract on main. This PR does not modify that registration flow or automatically enroll doctors for approval.
- If Production is missing a migration already required by main, this PR cannot repair that schema. It introduces no additional DB requirements for Admin/avatar.
- Avatar preview is temporary, local to browser memory; no data is persisted across refresh or devices.
- The Admin directory is limited to the first 500 doctor records sorted by name, preventing unbounded queries.
