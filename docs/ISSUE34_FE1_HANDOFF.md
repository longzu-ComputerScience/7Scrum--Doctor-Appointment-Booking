# Issue #34 — FE1 handoff: weekly schedule and V2 booking

**Status: component handoff / Draft PR. Full application integration and live acceptance are pending.**

Refs #34. Ownership: [FE2 #34](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/34) supplies the editor and booking components; [FE1 #33](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/33) owns auth wrappers, homepage, Sidebar and Doctor Dashboard; [BE2 #32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32) implements the HTTP/event contract with BE1 #31.

Target: [API_CONTRACT_V2.md on main](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/blob/main/docs/API_CONTRACT_V2.md), inspected blob `d6ee90f00bba8df908b045866db2a2dee2a462a2`. The older contract document in this checkout describes the superseded Staff flow. The published contract is the target; it is not proof of backend deployment. No backend/schema files or shared V1 types are changed by this handoff.

## Application integration status

| Surface | Delivered | Still required |
| --- | --- | --- |
| Weekly Schedule Editor | Reusable controlled fields, exported props/types/validation | FE1 mounts it in Doctor invitation Registration |
| Doctor schedule update | API-backed DoctorScheduleEditor with future effectiveDate and conflicts | FE1 mounts it inside the Doctor-only Dashboard; BE provides compatible endpoints |
| V2 Patient booking | Existing direct booking route imports the updated BookingClient and calendar | FE1 connects the real homepage/catalog and auth context |
| Intercepted popup | Existing @booking route imports the same BookingClient with intercepted=true | FE1 restores the root layout's booking slot and retains the Patient shell |
| Confirmation | Existing dialog/ticket design; opens only after validated 201 confirmed/reference | Real authenticated API/DB verification |
| Realtime | Subscription interface and five-second visible-tab GET fallback | BE defines transport/events; FE1 wires the subscriber |

The current `frontend/src/app/page.tsx` still contains its old hardcoded BookingView and local `setSubmitted(true)` confirmation. It does not enter the updated V2 route. The current root `layout.tsx` renders children only, omitting the @booking slot. Those FE1-owned files have deliberately not been changed. Component/unit checks do not establish a complete Dashboard-to-booking workflow.

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

The read-only comparison with `frontend_dev` at `5296896` found its newer PatientShell, UUID/API-backed DoctorBrowser, DoctorAvailability and root layout booking-slot wiring. Keep those owner components. This older worktree is not a replacement for that UI.

1. Preserve FE1's existing homepage/Sidebar/PatientShell behavior, search/filter state and navigation. Route DoctorBrowser's UUID selection to `/doctors/{id}/book` with Next Link (`scroll={false}` for the popup). Replace/bypass this worktree's old prototype BookingView; it must not present local confirmation as a real booking.
2. FE1's root layout must accept `booking: React.ReactNode` and render it alongside children. Keep the existing @booking default/catch-all routes. An illustrative layout composition is `{children}{booking}` within the appropriate Patient session bridge; do not rewrite or copy the entire shell to achieve this.
3. Provide Patient auth/profile/login navigation around **both** the normal booking route and @booking parallel slot. Maintain the Doctor-only Registration/Dashboard auth boundary separately.
4. Reconcile only the overlapping booking files. Preserve frontend_dev's Back to dashboard navigation and explicit demo-disabled hint/label alongside the V2 logic. Do not overwrite newer owner files or copy unrelated UI into a preview.

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

No FE1 homepage, root layout, Sidebar, auth route, Doctor Dashboard, backend, schema, separate frontend_dev worktree, commit or remote branch has been changed during this preparation. Existing integration gaps are recorded rather than hidden behind a synthetic final-product preview.

Run from `frontend/`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. The typecheck command regenerates route types. Unit HTTP stubs are isolated test inputs and never evidence of live booking/DB persistence. Existing browser evidence checked isolated editor/mobile layout and the real booking route's blocked/error state; full authenticated V2 calendar/confirmation/realtime E2E remains pending.

See [the prepared Draft PR description](ISSUE34_DRAFT_PR.md). Keep it Draft and use `Refs #34` until the missing application integration and live acceptance are completed.

## Final preparation checks

- PASS: 22 focused unit tests (20 V2 tests plus two shared timezone/date tests). The eight superseded manual Staff helper tests are preserved in local backups rather than shipped.
- PASS: ESLint, TypeScript/route type generation, production build and whitespace checks. The production build used the permitted external execution context for Next.js generated output.
- PASS: source routes/dev-tools removed from the frontend tree; production manifest has only the homepage, not-found, direct/intercepted booking and legacy Staff page.
- PASS: FE1-owned homepage/layout/Staff wrapper hashes unchanged; no Sidebar or other-worktree edits.
- BLOCKED: real backend, auth/DB persistence, event delivery, FE1 screen mounts and complete application E2E acceptance.

Exactly 19 source/config/test/handover files are proposed for staging. Nothing has been staged or committed. The Draft PR description is prepared locally; no remote PR has been created.
