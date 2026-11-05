# Admin route handoff — read-only, no schema migration

The former /staff route redirects to /admin. Admin sign-in uses an existing
Supabase Auth account, with its authenticated user UUID allowlisted through
ADMIN_USER_IDS only on Render. The endpoint GET /api/admin/doctors
lists existing doctor profiles from the current doctors table.

This branch does not create admin_accounts or doctor_applications tables,
and does not execute or add Supabase migrations. Approve/Reject and a
pending-application queue are deliberately not implemented without a durable
database model.

For tests: configure ADMIN_USER_IDS with an existing Auth user UUID, sign
in with that existing account, and verify nonadmins receive HTTP 403.
Never put admin credentials or service-role keys in frontend variables.
