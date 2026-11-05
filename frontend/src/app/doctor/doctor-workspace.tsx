"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { RoleBoundary } from "../auth/role-boundary";
import { PatientShell } from "../patient-shell";
import { DoctorWorkingHours } from "./doctor-working-hours";
import { WeeklyScheduleEditor, type WorkingInterval } from "./weekly-schedule-editor";
import { useDoctorDashboard } from "./use-doctor-dashboard";
import { apiMessage, ContractApiError } from "@/lib/contract-api";
import { markNotificationRead, updateAppointment, type DoctorAppointment, type DoctorNotification, type DoctorProfile } from "@/lib/fe1-api";
import { formatScheduleDay, formatScheduleTime } from "@/lib/schedule-time";
import guestStyles from "./doctor-guest.module.css";
import styles from "./doctor-workspace.module.css";
import { AvatarEditor } from "../profile/avatar-editor";
import { useAvatarPreview } from "../profile/avatar-preview";

type Section = "overview" | "appointments" | "schedule" | "notifications" | "profile";
function Glyph({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    appointments: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6M9 9h6M9 13h6M9 17h4" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7 14h3M14 14h3M7 18h3" /></>,
    notifications: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9M10 21h4" /></>,
    profile: <><circle cx="12" cy="7" r="4" /><path d="M4 21c0-9 16-9 16 0" /></>,
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.overview}</svg>;
}
const sections = [{ key: "overview", label: "Overview" }, { key: "appointments", label: "Appointments" },
  { key: "schedule", label: "Working hours" }, { key: "profile", label: "My profile" }];
function AppointmentTime({ startAt, endAt }: { startAt: string; endAt: string }) {
  return <><strong>{formatScheduleDay(startAt)}</strong><small>{formatScheduleTime(startAt)}–{formatScheduleTime(endAt)} · VN</small></>;
}
function NotificationList({ rows, busyId, onRead, compact = false }: {
  rows: DoctorNotification[]; busyId: string; onRead: (row: DoctorNotification, open?: boolean) => Promise<void>; compact?: boolean;
}) {
  return <div className={styles.notifications}>
    {!rows.length && <div className={styles.empty}><Glyph name="notifications" /><h3>You’re all caught up.</h3><p>New booking notifications will appear here.</p></div>}
    {(compact ? rows.slice(0, 5) : rows).map(row => <article key={row.id} className={`${styles.notification} ${!row.readAt ? styles.unread : ""}`}>
      <span className={styles.notificationIcon}><Glyph name="appointments" /></span>
      <div><button className={styles.notificationLink} disabled={Boolean(busyId)} onClick={() => void onRead(row, true)}>{row.patientName} booked a visit</button>
        <p>{formatScheduleDay(row.startAt)} · {formatScheduleTime(row.startAt)}–{formatScheduleTime(row.endAt)} VN</p>
        <small>Received {formatScheduleDay(row.createdAt)} · {formatScheduleTime(row.createdAt)} VN</small>
        {!row.readAt && <button className={styles.textButton} disabled={Boolean(busyId)} onClick={() => void onRead(row)}>{busyId === row.id ? "Saving…" : "Mark as read"}</button>}
      </div><span className={styles.readState}>{row.readAt ? "Read" : "New"}</span>
    </article>)}
  </div>;
}
export function DoctorWorkspace({ appointmentId, initialSection = "overview", preview = false }: { appointmentId?: string; initialSection?: Section; preview?: boolean }) {
  const { state } = useAuth();
  if (preview && state.status === "signedOut" && !appointmentId) return <Workspace key={initialSection} token="" doctor={null} initialSection={initialSection} preview />;
  if (state.status === "signedOut" && !appointmentId) return <DoctorGuestOverview />;
  if (state.status === "ready" && state.identity.role === "doctor" && !state.identity.doctor.active)
    return <DoctorPendingApproval />;
  return <RoleBoundary role="doctor">{state.status === "ready" && state.identity.role === "doctor" &&
    <Workspace key={`${state.session.access_token}:${appointmentId ?? initialSection}`} token={state.session.access_token} doctor={state.identity.doctor} appointmentId={appointmentId} initialSection={initialSection} />}
  </RoleBoundary>;
}
function DoctorPendingApproval() {
  const { reload, signOut } = useAuth();
  return <main className={guestStyles.page}><section className={guestStyles.hero}>
    <div><span className={guestStyles.eyebrow}>DOCTOR APPLICATION</span>
      <h2>Your doctor account is inactive.</h2><p>Contact the clinic administrator for
      account status. Approval actions are not available in this database-free update.</p>
      <div className={guestStyles.actions}><button type="button" onClick={reload}>Check status</button>
        <button type="button" onClick={() => void signOut()}>Sign out</button></div>
    </div></section></main>;
}
function DoctorGuestOverview() {
  return <main className={guestStyles.page}>
    <header className={guestStyles.header}><Link href="/" className={guestStyles.brand}><span aria-hidden="true">✳</span> carely.</Link>
      <nav aria-label="Doctor account"><Link href="/">Patient portal</Link><Link href="/doctor/login">Sign in</Link><Link className={guestStyles.join} href="/doctor/register">Create account</Link></nav>
    </header>
    <div className={guestStyles.label}><span>DOCTOR PORTAL</span><h1>Overview</h1></div>
    <section className={guestStyles.hero}><div><span className={guestStyles.eyebrow}>A BETTER DAY OF CARE</span><h2>More time for<br /><em>the people</em><br />you care for.</h2>
      <p>Your practice in one calm place.</p><div className={guestStyles.actions}><Link href="/doctor?preview=1">Explore dashboard</Link><Link href="/doctor/login">Sign in</Link></div></div>
      <div className={guestStyles.visual} aria-hidden="true"><span>✳</span><strong>carely.</strong></div></section>
    <footer className={guestStyles.footer}>carely. · Thoughtful care, made simple.</footer>
  </main>;
}
function SchedulePreview() {
  const [hours, setHours] = useState<WorkingInterval[]>([]);
  return <section className={styles.card}><span className={styles.eyebrow}>WORKING HOURS PREVIEW</span><h2>Weekly working hours</h2>
    <p className={styles.help}>Explore the weekly editor. Sign in to load and save your schedule.</p>
    <WeeklyScheduleEditor value={hours} onChange={setHours} />
  </section>;
}
function Workspace({ token, doctor, appointmentId, initialSection, preview = false }: { token: string; doctor: DoctorProfile | null; appointmentId?: string; initialSection: Section; preview?: boolean }) {
  const router = useRouter();
  const { avatarFor } = useAvatarPreview();
  const doctorAvatar = doctor ? avatarFor(doctor.id) : null;
  const [section, setSection] = useState<Section>(initialSection);
  const [filter, setFilter] = useState("all");
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: "completed" | "cancelled" } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const mutationLock = useRef(false);
  const dashboard = useDoctorDashboard(token, doctor?.id ?? "");
  const { live, refresh } = dashboard;
  const snapshot = preview ? { status: "ready" as const, data: { appointments: [], upcoming: [], notifications: [] }, refreshedAt: 0 } : dashboard.snapshot;
  const data = snapshot.status === "ready" ? snapshot.data : null;
  const unread = data?.notifications.filter(item => !item.readAt).length ?? 0;
  const navigate = (key: string) => {
    if (appointmentId) { router.push(`/doctor?section=${key}`); return; }
    setSection(key as Section); setNotice("");
  };
  async function readNotification(notification: DoctorNotification, open = false) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusyId(notification.id); setMutationError("");
    try {
      if (!notification.readAt) { await markNotificationRead(notification.id, token); refresh(); }
      if (open) router.push(`/doctor/appointments/${notification.appointmentId}`);
    } catch (error) {
      setMutationError(apiMessage(error)); refresh();
      // Viewing the validated appointment link is independent from a failed read receipt.
      if (open) router.push(`/doctor/appointments/${notification.appointmentId}`);
    } finally { mutationLock.current = false; setBusyId(""); }
  }
  async function changeStatus() {
    if (!confirmAction || mutationLock.current || uncertain) return;
    mutationLock.current = true; setBusyId(confirmAction.id); setMutationError(""); setNotice("");
    try {
      await updateAppointment(confirmAction.id, confirmAction.status, token);
      setNotice(`Appointment ${confirmAction.status}.`); setConfirmAction(null); refresh();
    } catch (error) {
      setMutationError(apiMessage(error));
      if (!(error instanceof ContractApiError) || error.uncertain) setUncertain(true);
      refresh();
    } finally { mutationLock.current = false; setBusyId(""); }
  }
  function appointments(rows: DoctorAppointment[], empty: string) {
    return rows.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Patient</th><th>Appointment</th><th>Status</th><th><span className={styles.srOnly}>View appointment</span></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td><div className={styles.patient}><span>{row.patientName.trim().slice(0, 1).toUpperCase()}</span><div><strong>{row.patientName}</strong><small>{row.patientPhone}</small></div></div></td>
        <td><AppointmentTime startAt={row.startAt} endAt={row.endAt} /></td><td><span className={`${styles.badge} ${styles[row.status]}`}>{row.status}</span></td>
        <td><Link className={styles.viewLink} href={`/doctor/appointments/${row.id}`} aria-label={`View appointment for ${row.patientName}`}>View</Link></td></tr>)}</tbody></table></div>
      : <div className={styles.empty}><Glyph name="appointments" /><h3>{empty}</h3><p>Your schedule will update when a patient books a visit.</p></div>;
  }
  const current = data?.appointments.find(row => row.id === appointmentId) ?? data?.upcoming.find(row => row.id === appointmentId);
  const notification = data?.notifications.find(row => row.appointmentId === appointmentId);
  const detail = current ?? notification;
  return <PatientShell portal="doctor" active={appointmentId ? "appointments" : section} items={sections.map(item => ({ ...item, icon: <Glyph name={item.key} /> }))}
    onNavigate={navigate} onHelp={() => setSection("profile")}>
    <div className={styles.workspace}>
      <header className={styles.header}><div><span className={styles.eyebrow}>DOCTOR PORTAL</span><h1>{appointmentId ? "Appointment details" : sections.find(item => item.key === section)?.label}</h1></div>
        <div className={styles.headerActions}><details className={styles.bellMenu}><summary aria-label={`Notifications${data ? `, ${unread} unread` : ""}`}><Glyph name="notifications" />{unread > 0 && <span className={styles.count}>{unread}</span>}</summary>
          <div className={styles.dropdown}><div className={styles.cardHeading}><h2>Notifications</h2><button className={styles.textButton} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); navigate("notifications"); }}>View all</button></div>
            {data ? <NotificationList rows={data.notifications} busyId={busyId} onRead={readNotification} compact /> : <p className={styles.help}>Notifications are unavailable until your dashboard loads.</p>}</div></details>
          <span className={styles.avatar} style={doctorAvatar ? {
            backgroundImage: "url(" + JSON.stringify(doctorAvatar) + ")",
            backgroundPosition: "center", backgroundSize: "cover"
          } : undefined}>{doctorAvatar ? null : doctor?.name.trim().slice(0, 1) ?? "✳"}</span><div className={styles.headerIdentity}><strong>{doctor?.name ?? "Doctor preview"}</strong><small>{doctor?.specialty ?? "Explore the workspace"}</small></div>
        </div>
      </header>
      <div className={styles.body}>
        {mutationError && <p className={styles.error} role="alert">{mutationError}</p>}
        {notice && <p className={styles.success} role="status">{notice}</p>}
        {uncertain && <div className={styles.error} role="alert"><p>The update may have been saved. Review the refreshed appointment status before another action.</p><button className={styles.secondary} disabled={!data} onClick={() => { setUncertain(false); setConfirmAction(null); }}>I have reviewed the latest status</button></div>}
        {snapshot.status === "loading" && <div className={styles.card} role="status">Loading appointments and notifications…</div>}
        {snapshot.status === "error" && <div className={styles.error} role="alert"><h2>Couldn’t load your dashboard</h2><p>{apiMessage(snapshot.error)}</p><button className={styles.secondary} onClick={refresh}>Try again</button></div>}
        {appointmentId ? <>
          <Link href="/doctor" className={styles.textButton}>Back to dashboard</Link>
          {data && (detail ? <section className={styles.card}><span className={styles.eyebrow}>APPOINTMENT</span><h2>{detail.patientName}</h2>
            <div className={styles.detailGrid}><div><small>Date &amp; time</small><AppointmentTime startAt={detail.startAt} endAt={detail.endAt} /></div>
              {current && <><div><small>Phone</small><strong>{current.patientPhone}</strong></div><div><small>Status</small><span className={`${styles.badge} ${styles[current.status]}`}>{current.status}</span></div></>}
              <div><small>Appointment ID</small><code>{appointmentId}</code></div></div>
            {!current && <p className={styles.help}>This booking is in your notifications, but outside the latest appointment results. Its current status is unavailable.</p>}
            {current?.status === "confirmed" && <div className={styles.actions}><button className={styles.primary} disabled={Boolean(busyId) || uncertain} onClick={() => setConfirmAction({ id: current.id, status: "completed" })}>Mark completed</button>
              <button className={styles.secondary} disabled={Boolean(busyId) || uncertain} onClick={() => setConfirmAction({ id: current.id, status: "cancelled" })}>Cancel appointment</button></div>}
            {confirmAction && current?.status === "confirmed" && <div className={styles.confirm}><p>{confirmAction.status === "cancelled" ? "Cancel this appointment? The patient’s time will become available again if it is still bookable." : "Mark this appointment as completed? This is a final status."}</p>
              <div className={styles.actions}><button className={styles.primary} disabled={Boolean(busyId) || uncertain} onClick={() => void changeStatus()}>{busyId ? "Saving…" : "Confirm change"}</button><button className={styles.secondary} disabled={Boolean(busyId)} onClick={() => setConfirmAction(null)}>Keep current status</button></div></div>}
          </section> : <div className={styles.card}><h2>Appointment unavailable</h2><p>This appointment is not in your recent appointments or notifications. Nothing from another doctor is shown.</p></div>)}
        </> : <>
          {section === "overview" && <>
            <section className={styles.welcome}><div><span className={styles.eyebrow}>YOUR PRACTICE, AT A GLANCE</span><h2>A little clarity.<br /><em>More room for care.</em></h2><p>{preview ? "Explore appointments, working hours and notifications." : `Welcome, ${doctor?.name}. Your next visits and patient updates are right here.`}</p><button className={styles.primary} onClick={() => setSection("schedule")}>Manage working hours</button></div><div className={styles.welcomeArt} aria-hidden="true"><div className={styles.cross}>+</div><span>carely.</span></div></section>
            <div className={styles.stats}>{(["confirmed", "completed", "cancelled"] as const).map(status => <div className={styles.stat} key={status}><span className={`${styles.statIcon} ${styles[status]}`}><Glyph name={status === "confirmed" ? "schedule" : "appointments"} /></span><div><span className={styles.statLabel}>{status}</span><strong>{data ? data.appointments.filter(row => row.status === status).length : "—"}</strong><small>In latest appointments</small></div></div>)}</div>
            <section className={styles.card}><div className={styles.cardHeading}><div><h2>Upcoming appointments</h2><p>Future confirmed visits · nearest first</p></div><button className={styles.textButton} onClick={() => setSection("appointments")}>View appointments</button></div>{data && appointments(data.upcoming, "No upcoming appointments.")}</section>
          </>}
          {section === "appointments" && <section className={styles.card}><div className={styles.cardHeading}><div><h2>Your appointments</h2><p>Up to 100 latest appointments. Counts describe these results.</p></div><button className={styles.textButton} onClick={refresh}>Refresh ↻</button></div>
            <div className={styles.tabs} aria-label="Filter appointments">{["all", "upcoming", "confirmed", "completed", "cancelled"].map(item => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
            {data && appointments(filter === "upcoming" ? data.upcoming : data.appointments.filter(row => filter === "all" || row.status === filter), "No appointments in this view.")}</section>}
          {section === "notifications" && <section className={styles.card}><div className={styles.cardHeading}><div><h2>Notifications {data && <span className={styles.inlineCount}>{unread} unread</span>}</h2><p>Latest 100 booking updates · saved to your account</p></div><button className={styles.textButton} onClick={refresh}>Refresh ↻</button></div>{data && <NotificationList rows={data.notifications} busyId={busyId} onRead={readNotification} />}</section>}
          {section === "schedule" && (preview ? <SchedulePreview /> : <DoctorWorkingHours token={token} onSaved={refresh} />)}
          {section === "profile" && <section className={styles.card}><span className={styles.eyebrow}>YOUR DOCTOR PROFILE</span><h2>{doctor?.name ?? "Doctor profile"}</h2>{doctor && !preview &&
              <AvatarEditor userId={doctor.id} name={doctor.name} />}{doctor ? <div className={styles.detailGrid}><div><small>Specialty</small><strong>{doctor.specialty}</strong></div><div><small>Profile status</small><strong>{doctor.active ? "Active" : "Inactive"}</strong></div><div><small>Doctor ID</small><code>{doctor.id}</code></div></div> : <p className={styles.help}>Sign in to see the profile linked to your account.</p>}</section>}
        </>}
        <footer className={styles.footer}><span>carely. · Thoughtful care, made simple.</span><span role="status">{preview ? "Preview · No account data" : snapshot.status === "ready" ? `${live ? "Live updates" : "Auto-refresh every 5 seconds"} · Vietnam time` : "Waiting for current data"}</span></footer>
      </div>
    </div>
  </PatientShell>;
}
