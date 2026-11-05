# 7Scrum Feature Preview (items 2–9)

Branch: `feat/doctor-portal-improvements-20261105`. No database Production changes, no deployment to Render Production, no merge into main.

## Scope
- Specialist dropdown, search by name/keyword and district, shared specialties in Doctor Registration (derived from active doctor catalog).
- Existing /admin login + pending applications from local work, /staff redirect to /admin.
- Private avatar upload for Patient and Doctor dashboards, with JWT-bound backend ownership and signed private URLs.
- Persisted Supabase browser Auth session via one shared client (no extra session table).
- My Appointments is loaded through a Patient JWT-scoped API, not localStorage or mock cards.
- Home and login/register restrained transitions, story rotation, subtle hover states, stronger chatbot affordance; motion reduced by OS preferences.
- Doctor registration with certificate upload remains as on current main; no reintroduction of invitation-code flow.

## Schema deployment prerequisites
1. Check Production migration history and backup. On the branch, `007_doctor_profile_registration.sql` is from main, not changed.
2. Apply `008_admin_doctor_approval.sql` **once** after 007, then `009_profile_media_and_doctor_approvals.sql`.
3. 009 creates nullable avatar_path on public.patient_profiles and public.doctors; a **private** profile-avatars bucket; a trigger which queues **new** doctor self-registrations as pending and sets the new doctor inactive; and an atomic admin approval RPC to activate the doctor. Existing active doctors are not reclassified.
4. Bootstrap an initial Admin by creating a trusted Supabase Auth account then securely inserting its UUID into public.admin_accounts. Do not provide a public Admin signup.
5. Render backend and Vercel frontend must be released against the **same DB schema** after migrations; otherwise new profile queries and API routes will not work. Treat the auto-generated Vercel Preview primarily as a UI/build review if its BACKEND_URL still points to an unchanged production Render service.

## Verify before merging
- Run backend pytest/Ruff, frontend npm lint/tsc/build, Vercel Preview statuses.
- Confirm anonymous doctor catalog contains only active doctors, and pending new doctors cannot book/manage schedules.
- Test logged-in Patient booking -> My Appointments after reload; confirm no other Patient's appointments can be read.
- Test Patient and Doctor avatar upload with two different accounts; path ownership and signed URLs are verified server-side, no public Storage policies.
- Admin login: ordinary Patient/Doctor denied, Admin gets pending applications and signed 5-minute document links, approval activates the account, rejection keeps it inactive.
- Test both doctor/patient session persistence after reload and logout.
- Responsive UI and prefers-reduced-motion checks.

## Rollback
No destructive migration is included. If backend deploy fails, keep previous production deployment available. Migrations may add columns/tables/trigger that older backend simply ignores. For a functional rollback of the new Doctor application trigger, explicitly review disabling it; do not drop data or revoke existing Auth accounts automatically.

## Known limitations
- Existing doctor registrations created before 009 are **not retroactively queued**, since automatically disabling already-active clinicians might interrupt real appointments.
- Applying migrations to Production and verifying a real Render backend/Storage roundtrip are outside this branch/Preview step.
