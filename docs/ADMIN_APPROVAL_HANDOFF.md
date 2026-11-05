# Admin doctor application review — implementation handoff

Branch: `feat/admin-doctor-approval` based on main commit `3052158`.

## Added
- `/admin` responsive dashboard for queue, search, pending/approved/rejected filters, application detail and review reasons.
- `/staff` redirects to `/admin`; historical staff components remain in the repo for safe migration.
- `GET /api/admin/doctor-applications`, `POST /api/admin/doctor-applications/{id}/review` using Supabase JWT identity + `admin_accounts` verification.
- Migration `006_admin_doctor_approval.sql`: `admin_accounts`, `doctor_applications`, atomic pending-only review RPC. Apply only after 005 and DB backup.

## Important boundaries
- **Demo data is fictional** and is never persisted; demo decisions only update browser state.
- Existing doctor onboarding uses a pre-existing Doctor + invitation. This change adds a *separate application review queue*, not a replacement for Doctor registration.
- Approval of an application **does not** create Doctor Auth, mark a doctor as active, generate an invitation or allow booking. Those steps require an explicit approved product workflow and integration with FE1/BE1/BE2.
- Admin setup is manual. First create an authorized account via Supabase Auth, verify its UUID, then insert that UUID into `public.admin_accounts` from a privileged SQL session. Never let clients register themselves as admins.
- `doctor_applications` is a backend-owned queue; no self-service application submission endpoint or credentials upload has been added. A future Doctor application form + secure storage policies are a separate task.
- Sensitive credentials should be inspected only via authenticated, authorized endpoints, not public tables; no patient information is included.
- Do not execute migrations on a shared DB without BE1 coordination. No live migration applied by this branch.

## API
- GET requires a valid Bearer token for an entry in `admin_accounts` and returns `{applications:[...]}` (max 200).
- POST receives `{decision:"approved"|"rejected",reason?:string}`. Reject requires reason. Duplicate decisions return 409.
- The database checks the admin identity again within the atomic review RPC. The backend never trusts a caller-supplied administrator UUID.

## Follow-up integration
1. PO decides whether invitation registration remains or is replaced by self-application then Admin approval.
2. BE1 adds an authorized intake path and documents verification/credential storage (private objects, signed access).
3. BE2 links approval to invitation/activation only after that contract is approved.
4. FE1 modifies Doctor Registration only after the contract is ready.
5. Tester verifies auth isolation, concurrent review, 409 and data persistence on shared Supabase.

## Local demo
Run `cd frontend && npm run dev` then open `http://localhost:3000/admin`. Choose **View interactive demo** for fictional cases. The demo does not require Supabase credentials.
