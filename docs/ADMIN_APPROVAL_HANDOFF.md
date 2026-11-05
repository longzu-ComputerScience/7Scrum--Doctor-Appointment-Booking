# Admin doctor application review — handoff

Branch: `feat/admin-doctor-approval`, originally based on main `3052158`.

## UI
- `/admin` displays **only Administrator login** when signed out.
- After Supabase Auth **and** backend Admin authorization succeeds, it displays only the **pending doctor applications** table, search, refresh and review details.
- **Approve/Reject** decisions are written to the backend review API; rejection requires a reason.
- No preview/demo data, Doctor directory, Audit history or Approved/Rejected navigation.
- `/staff` redirects to `/admin` to retire the legacy route.

## Backend & data
- `GET /api/admin/doctor-applications`: requires a valid Bearer token linked to `admin_accounts`; lists pending applications only (max 200).
- `POST /api/admin/doctor-applications/{id}/review`: validates Admin credentials; atomically changes pending to approved or rejected with audit metadata.
- Apply `supabase/migrations/006_admin_doctor_approval.sql` **only after 005 and BE1 review/backup**.
- Admin must be provisioned manually: create Auth account and securely insert its UUID into `public.admin_accounts` via privileged SQL. No public admin signup.

## Important integration limitation
- Doctor registration in current project still uses **invitation + pre-existing Doctor profile**.
- The new `doctor_applications` intake table does **not yet receive records from Doctor registration**. Approval in this queue does not create/activate a Doctor account.
- Real end-to-end Doctor self-application → Admin approval → account activation requires a separate coordinated change to FE1 registration, BE2 auth, and BE1 DB/RPC.
- Do not present sample application metadata as verified credentials; actual document upload, secure storage and checking have not been implemented.

## Local verification
Run `cd frontend && npm run dev`, then open `http://localhost:3000/admin`.
To exercise the actual list, the FastAPI backend, configured Supabase database (migration 006), an Admin account and pending application rows are required. Without these, the screen correctly reports an authorization/data-loading issue rather than fabricating applications.
