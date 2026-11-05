# FE1 handoff — Patient/Doctor Auth, Doctor List, Doctor Dashboard

This frontend branch implements the updated UI flow from issue #33. Screenshots in this directory show the production frontend build with no Supabase or backend environment configured. They are layout evidence, **not proof of a successful authenticated booking or a live API/database integration**. No test identities, appointment rows, access tokens, or invitation codes are embedded in production UI. The Doctor workspace is available at `/doctor?preview=1` for UI review without an API. The standard signed-out `/doctor` page shows only Overview.

## Flows wired to HTTP and Supabase

- Patient registration: `POST /api/auth/patients/register` with `name,email,phone,password`, then Supabase signup confirmation resend. Patient login and logout use Supabase Auth. `GET /api/patient/me` establishes the Patient role/profile and pre-fills FE2 booking through the shared provider in root layout, including the intercepted booking popup.
- Doctor registration preview: full name, address, phone, specialty, password, certificate name/issuer/number and a supporting PDF/image can be entered and validated in the browser. No account or file is submitted until BE supports the new payload. Doctor login/session and `GET /api/doctor/me` remain wired for existing accounts.
- Doctor List: public `GET /api/doctors` with server-side `specialty`/`keyword` filters. Doctor rows and the booking CTA navigate to FE2's `/doctors/{id}/book`. The catalog does not report a booking result.
- Dashboard: `GET /api/doctor/appointments`, `GET /api/doctor/appointments?view=upcoming`, and `GET /api/doctor/notifications`. Upcoming is limited to future confirmed visits and sorted by start time. Status actions use `PATCH /api/doctor/appointments/{id}`. Notification read uses `PATCH /api/doctor/notifications/{id}`. Notifications are reached through the header bell instead of a sidebar item. Each mutation requires a matching response before UI success.
- Realtime: Doctor-scoped `appointment_notifications` and `doctor_calendar_revisions` changes invalidate and refetch the authenticated HTTP lists. Subscription/reconnect, tab focus/visibility/online, and visible-tab five-second polling refresh the persisted data.
- Working hours: Doctor dashboard imports FE2 `WeeklyScheduleEditor` for first-time setup and `DoctorScheduleEditor` for updates. It handles `GET /api/doctor/schedule` 404 as an unconfigured schedule, and uses FE2 `PUT /api/doctor/schedule` with a future effective date. No separate weekly editor was created.

## Contract dependency after the product change

The latest [API Contract V2](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/blob/main/docs/API_CONTRACT_V2.md) still requires `invitationCode` and `weeklyIntervals` in **Doctor registration**. The product direction in this task replaces invitation with personal details and a practice certificate, and moves schedule selection to the Dashboard. BE2 needs a new Doctor registration/file-upload contract, certificate storage/verification rules, and support for the first schedule via `PUT /api/doctor/schedule`. Doctor registration is therefore a UI preview and clearly states that no account or file was saved.

## Verification

From `frontend/`: `npm test` (55 passing), `npm run lint`, `npm run typecheck`, and `npm run build` all pass. HTTP tests stub responses to cover request bodies, role/ownership validation, status filters, notifications, registration errors, and ambiguous writes. The browser build was checked at desktop and mobile sizes for guest Overview and Auth screens, and the Doctor preview modules were navigated. No `.env.local`, backend listener, or disposable account existed in this checkout, so live registration, booking persistence, and realtime event delivery remain for QA in the integrated environment.
