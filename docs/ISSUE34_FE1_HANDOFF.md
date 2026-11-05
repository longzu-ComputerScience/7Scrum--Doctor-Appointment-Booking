# Issue #34 — FE1 handoff: weekly schedule and V2 booking

**Status: user-approved normal integration of origin/frontend_dev (5296896) into feat/staff-schedule-ui. Patient shell/catalog/modal routing are reconciled; Doctor mounts, Patient auth and live acceptance remain pending.**

Refs #34. Ownership: [FE2 #34](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/34) supplies the editor and booking components; [FE1 #33](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/33) owns auth wrappers, homepage, Sidebar and Doctor Dashboard; [BE2 #32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32) implements the HTTP/event contract with BE1 #31.

Target: [API_CONTRACT_V2.md on main](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/blob/main/docs/API_CONTRACT_V2.md), inspected blob `d6ee90f00bba8df908b045866db2a2dee2a462a2`. The older contract document in this checkout describes the superseded Staff flow. The published contract is the target; it is not proof of backend deployment. No backend/schema files or shared V1 types are changed by this handoff.

## Application integration status

| Surface | Delivered | Still required |
| --- | --- | --- |
| Weekly Schedule Editor | Reusable controlled fields, exported props/types/validation | FE1 mounts it in Doctor invitation Registration |
| Doctor schedule update | API-backed DoctorScheduleEditor with future effectiveDate and conflicts | FE1 mounts it inside the Doctor-only Dashboard; BE provides compatible endpoints |
| V2 Patient booking | frontend_dev homepage/catalog and V2 BookingClient are connected in this integrated implementation | FE1 supplies actual Patient auth/profile; BE/QA verify live behavior |
| Intercepted popup | Root layout renders the existing @booking slot; both routes use V2 BookingClient | FE1 supplies a shared session bridge and QA verifies authenticated E2E |
| Confirmation | Existing dialog/ticket design; opens only after validated 201 confirmed/reference | Real authenticated API/DB verification |
| Realtime | Subscription interface and five-second visible-tab GET fallback | BE defines transport/events; FE1 wires the subscriber |

The integrated implementation now retains origin/frontend_dev's PatientShell, API-backed DoctorBrowser, homepage and root layout booking slot. Its old hardcoded homepage BookingView/local confirmation has been replaced by the incoming API-backed flow. Booking navigation/demo hints and display normalization are combined with V2 validation/authentication. The reviewed resolution is finalized through a normal Git merge. This does not establish live booking or database persistence.

## WeeklyScheduleEditor: Doctor Registration

Path: `frontend/src/app/doctor/weekly-schedule-editor.tsx`.

```ts
export type WorkingInterval = {
  dayOfWeek: number; // 1=Monday ... 7=Sunday
  startTime: string; // HH:mm, Asia/Ho_Chi_Minh
  endTime: string;
};
export type WeeklyScheduleEditorProps = {
  value: WorkingInterval[];
  onChange: (value: WorkingInterval[]) => void;
  disabled?: boolean; // default false
  errors?: WeeklyScheduleErrors;
};
export type WeeklyScheduleErrors = {
  summary?: string;
  effectiveDate?: string;
  intervals: Record<number, string>; // index in value
};
```

The module also exports `WeeklyScheduleValue`, `validateWeeklySchedule` and `hasWeeklyErrors`. It renders fields only, with unique instance IDs and no nested form, registration request or auth wrapper. Multiple instances can be placed in FE1 client components.

```tsx
import {
  WeeklyScheduleEditor, validateWeeklySchedule, hasWeeklyErrors,
  type WorkingInterval, type WeeklyScheduleErrors,
} from "@/app/doctor/weekly-schedule-editor";

// Inside FE1's Registration client component:
const [weeklyIntervals, setWeeklyIntervals] = useState<WorkingInterval[]>([]);
const [errors, setErrors] = useState<WeeklyScheduleErrors>({ intervals: {} });

<WeeklyScheduleEditor value={weeklyIntervals} onChange={setWeeklyIntervals}
  errors={errors} disabled={submitting} />

// In FE1's existing outer form submit handler:
const validation = validateWeeklySchedule(weeklyIntervals);
setErrors(validation);
if (hasWeeklyErrors(validation)) return;
// Send weeklyIntervals with email/password/invitationCode to the documented
// Doctor registration endpoint. FE1 owns that request and its auth/errors.
```

Validation: at least one day/interval; weekday 1–7; valid HH:mm; end strictly after start on the same day; duration >=30 minutes and a multiple of 30; no overlapping intervals on one day. Adjacent intervals and multiple intervals per weekday are supported. Registration does not supply an update effectiveDate.

The editor and booking share neutral date/display helpers in `frontend/src/lib/schedule-time.ts`; no legacy Staff adapter or helper is needed. Include the complete production file set, not only the editor TSX.

## DoctorScheduleEditor: Doctor Dashboard

Path: `frontend/src/app/doctor/doctor-schedule-editor.tsx`.

```ts
export type DoctorScheduleEditorProps = {
  token: string;
  onSaved?: (value: WeeklyScheduleValue) => void;
};
// WeeklyScheduleValue = { weeklyIntervals: WorkingInterval[]; effectiveDate: string }
```

```tsx
import { DoctorScheduleEditor } from "@/app/doctor/doctor-schedule-editor";

<DoctorScheduleEditor token={session.access_token}
  onSaved={refreshDoctorDashboard} />
```

Mount only after FE1 resolves a Doctor-authorized session. This component owns a form, so do not nest it in another form. Token changes remount it and abort old reads/writes. Loading/read/permission errors and empty schedules are supported. Reload saved schedule intentionally replaces the draft.

- GET `/api/doctor/schedule`, Bearer JWT: validates timezone Asia/Ho_Chi_Minh, intervals and effectiveDate.
- PUT `/api/doctor/schedule`, Bearer JWT: sends only `{effectiveDate,weeklyIntervals}`; update date must be after today in Vietnam.
- HTTP 200 with a validated matching saved schedule is required before success/onSaved. No optimistic save or manual slot creation.
- HTTP 409 `SCHEDULE_CONFLICT`: displays validated `conflicts[]` dates/times and appointment IDs, preserves the draft, and never cancels/moves/overwrites appointments or automatically retries.
- 422 maps safe field-location errors. 401/403 block unauthorized editing. Ambiguous network/5xx/malformed write results lock the form until the saved schedule is reloaded for verification.

## V2 BookingClient and existing modal

Path: `frontend/src/app/doctors/[id]/book/booking-client.tsx`.

```ts
export type BookingClientProps = { doctorId: string; intercepted?: boolean };
```

Existing route wiring is retained:

- `doctors/[id]/book/page.tsx` renders `<BookingClient doctorId={id} />`.
- `@booking/(.)doctors/[id]/book/page.tsx` renders the same client with `intercepted`.
- BookingClient renders the existing BookingDialog and BookingCalendar; it retains the established form layout, popup close/focus/scroll/busy behavior and reference-ticket confirmation view. BookingDialog itself is unchanged.

The client reads Doctor detail and `/api/doctors/{id}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD` in a bounded 28-day Vietnam window. Slot IDs come from the server. Runtime checks reject invalid, duplicate, overlapping or non-30-minute slot responses; past/out-of-window rows are omitted. It uses Doctor `address/district`, not a clinic-only fallback.

Only a Patient session can submit. POST `/api/appointments` sends Bearer JWT and `{slotId,patientName,patientPhone,notes}`. Only a validated **201**, `status: confirmed`, UUID appointment ID and nonempty reference opens confirmation. Demo/unsigned/unauthorized states cannot book. `requested`, malformed bodies and unexpected 2xx responses cannot confirm a booking.

Validation, loading/empty/error states, 401/403/409/422/503, non-JSON/network errors and duplicate-submit protection are handled. Failed reads clear bookable times. Ambiguous writes require explicit user verification and a successful availability reload before retry; mutations are never automatically repeated. Successful confirmation does not establish database persistence beyond the backend contract; QA must verify it with real test accounts.

## Required FE1 homepage, Sidebar, authentication and modal work

The read-only comparison with `frontend_dev` at `5296896` found its newer PatientShell, UUID/API-backed DoctorBrowser, DoctorAvailability and root layout booking-slot wiring. Keep those owner components. The incoming UI is now retained in this integrated implementation. The original frontend_dev worktree remains untouched.

1. Review and retain the restored homepage/Sidebar/PatientShell behavior, search/filter state and navigation. DoctorBrowser already links UUID selections to `/doctors/{id}/book` using Next Link with `scroll={false}`; the older local-confirmation prototype is no longer used.
2. Keep the restored root layout accepting `booking: React.ReactNode` and rendering it alongside children, with the existing @booking default/catch-all routes. Add the appropriate Patient session bridge around both surfaces rather than rewriting the shell.
3. Provide Patient auth/profile/login navigation around **both** the normal booking route and @booking parallel slot. Maintain the Doctor-only Registration/Dashboard auth boundary separately.
4. Review the combined overlapping booking files: frontend_dev's Back to dashboard navigation, explicit demo-disabled hint/label and display normalization are retained alongside V2 guards. Catalog display accepts both V1 preview and V2 address fields; booking itself still requires the strict V2 schema. DoctorAvailability uses the same bounded 30-minute slot parser.

### Patient session provider

Path: `frontend/src/app/doctors/[id]/book/booking-session.tsx`.

```tsx
import { BookingSessionProvider } from "@/app/doctors/[id]/book/booking-session";

<BookingSessionProvider
  sessionState={{ status: "ready", session: { accessToken: session.access_token, patient } }}
  onRequireLogin={openPatientLogin}
  subscribeToAvailability={subscribeToAvailability}
>
  {children}
  {booking}
</BookingSessionProvider>
```

This illustrates FE1's **client** session bridge, not an added wrapper in this handoff. `patient` is `{id,name,phone,email}` from authenticated GET `/api/patient/me`. The backend derives Patient identity from JWT, not IDs in the booking payload.

Exported `BookingSessionState` also accepts `{status:"loading"}`, `{status:"ready",session:null}` and `{status:"error",error}`. Clear old identity/profile during session transitions. Without a provider, the client only reads an existing Supabase SDK session with browser-safe public environment settings and fetches `/api/patient/me`; it does not implement login or registration. No configured session means booking remains disabled. Never put a service-role key in the frontend.

### Realtime and refetch

The exported `AvailabilitySubscription` signature is:

```ts
(doctorId: string, onChange: () => void, onReconnect: () => void) => () => void;
```

Both callbacks refetch authoritative GET availability. Supply an unsubscribe function. Until an approved transport exists, five-second polling while visible plus online/focus/visibility restoration remains active. A transport failure falls back to GET; no undocumented channel or direct business-table subscription is assumed.

Public AvailableSlot responses contain only unbooked slots. A previously observed slot missing from a successful refresh is disabled and labeled Unavailable; that absence does not prove an occupied appointment because schedule edits can also remove slots. Initial authoritative occupied labels require an approved backend contract if still demanded; never infer private appointment data.

## Backend and acceptance blockers

- BE1 #31 / BE2 #32: recurring working-hours schema and transactional 30-minute materialization, compatible authenticated schedule GET/PUT with atomic conflict rejection, and V2 Doctor/address/date-windowed availability responses.
- BE2: Patient `/api/patient/me`, JWT-verified atomic booking returning 201 confirmed/reference, persistent Doctor notifications in the booking transaction, ownership/role checks and documented error schemas. This checkout still has the legacy unauthenticated booking handler and lacks the target schedule/profile routes.
- BE2: doctor-scoped event transport, payload, after-commit delivery and reconnect semantics. Real event delivery is not implemented merely by exporting a frontend callback.
- FE1: actual Registration/Dashboard mounts, Patient provider/navigation and root modal-slot connection as above.
- QA #35: disposable valid accounts/environment; verify authorization, future schedule conflict preservation, concurrent booking, saved state after reload, cancellation/schedule-driven availability, notification persistence and realtime/reconnect. No valid live test session or successful persistence claim is part of this handoff.

## Scope, previews and verification

This Draft PR contains production components, focused V2 tests and this documentation. Both `/issue34-review` and `/staff/preview` source routes are absent. Preview source, legacy Staff adapters/styles/tests and earlier review evidence were preserved under ignored `/output/`, outside the frontend build tree. They must not be staged. Shared timezone helpers have been retained in the neutral lib module. The only retained Staff change is the compatibility notice removing manual slot creation from that legacy screen.

This reconciliation updates the Carely-staff working tree only. Patient homepage/layout/Sidebar and Staff Dashboard files are taken from origin/frontend_dev; catalog display/availability receive narrow V2 compatibility changes. The homepage also uses Next router navigation for section hashes to preserve popup Close/reopen/Back history. Backend/schema files and the original frontend_dev worktree are unchanged. Only feat/staff-schedule-ui receives the approved normal merge; no PR is merged into frontend_dev or main, and no synthetic production route is introduced.

Run from `frontend/`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. The typecheck command regenerates route types. Unit HTTP stubs are isolated test inputs and never evidence of live booking/DB persistence. Existing browser evidence checked isolated editor/mobile layout and the real booking route's blocked/error state; full authenticated V2 calendar/confirmation/realtime E2E remains pending.

See [the prepared Draft PR description](ISSUE34_DRAFT_PR.md). Keep it Draft and use `Refs #34` until the missing application integration and live acceptance are completed.

## Conflict resolution verification

- Remote refs were refreshed with git fetch origin. Compared HEAD d9dea26 with origin/frontend_dev 5296896 using merge base d91b51d. The initial clean index had no active merge; after user approval, the normal merge was started with --no-ff --no-commit for a fresh verification pass.
- Read-only three-way inspection predicted conflicts in booking-client.tsx and booking-utils.ts (two regions each). Both are reconciled in the integrated implementation; CSS combines the incoming back-link styles with V2 overflow/status styles.
- The 10 protected V2 editor/calendar/session/HTTP/time source files are byte-identical to the original source commit d9dea26. Fifteen incoming files, including PatientShell, layout, globals and Staff UI, match origin/frontend_dev exactly. The incoming homepage has only the additional Next router history fix; three catalog/display files contain reviewed V2 compatibility adaptations.
- PASS: 40 unit tests (22 V2/time tests, 15 incoming Staff API tests, three reconciliation regressions), ESLint, TypeScript, production build and whitespace checks.
- PASS: no preview/review source route or production manifest entry.
- BLOCKED: Doctor Registration/Dashboard mounts, actual Patient auth/profile bridge, compatible backend/DB persistence, event delivery and authenticated E2E acceptance.

The user reviewed and approved the resolution before finalization. The approved files were preserved in a SHA256-verified backup and named safety stash, restored into the normal merge, and rechecked before its merge commit and normal push. See ignored output/finalize-integration for recovery evidence and output/conflict-review for the original inspection. The final commit is identified by Git history; frontend_dev and main are not PR-merged by this work.
## Additional navigation verification

Production browser QA exposed a parallel-slot cache case when closing back to `/#book`. BookingClient guards intercepted rendering with usePathname, so stale slot content unmounts the dialog and aborts its requests. The homepage changes section hashes through Next router.push with scroll disabled, keeping Next's history tree synchronized. A fresh visit to `/` verified Dashboard → Doctor Browser → popup → Close, then reopen → browser Back. Both exits removed the open dialog, returned to `/#book`, restored body scrolling and focused the original doctor link. All 40 tests, ESLint, typecheck and production build passed after this fix. Earlier verification also covered desktop Sidebar collapse/expand and the 390px mobile drawer; document scrollWidth 375 was within the 390px viewport. The actual public catalog was demo mode; its legacy detail response was rejected by the strict V2 booking parser. No booking was submitted or persistence invented. Evidence is in ignored output/finalize-integration, and the temporary port-3100 production QA server was stopped afterward.
