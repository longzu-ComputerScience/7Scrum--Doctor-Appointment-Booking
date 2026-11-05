"use client";

import { useEffect, useRef, useState } from "react";
import type { AppointmentStatus } from "@/lib/types";
import { clinicDate, displayDate, displayTime, initials, sampleAppointments, statusLabels, type Appointment } from "./appointment-data";
import { StaffIcon } from "./staff-icon";
import { confirmStaffAppointment, loadStaffAppointments, StaffApiError } from "./staff-api";
import styles from "./staff.module.css";

export type AppointmentListProps = {
  /** Supabase session.access_token, supplied by the auth-owning page. */
  token: string;
  /** Explicit, read-only synthetic preview; never a fallback for API failures. */
  preview: boolean;
  /** V2 confirmation approved for this task; set false for a read-only integration. */
  allowConfirmation?: boolean;
  /** Auth owner should refresh the Supabase session or show sign-in. */
  onSessionExpired?: () => void;
  /** Initial view only; all returned statuses remain available as filters. */
  initialStatus?: AppointmentStatus | "all";
};

export function AppointmentList(props: AppointmentListProps) {
  // A changed session must never render the previous user's patient records.
  return <AppointmentWorkspace key={props.preview ? "preview" : props.token} {...props} />;
}

function AppointmentWorkspace({ token, preview, allowConfirmation = true, onSessionExpired, initialStatus = "all" }: AppointmentListProps) {
  const [rows, setRows] = useState<Appointment[]>(preview ? sampleAppointments : []);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState<401 | 403 | null>(null);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AppointmentStatus | "all">(initialStatus);
  const [doctor, setDoctor] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    loadStaffAppointments(token, controller.signal)
      .then(appointments => {
        if (!controller.signal.aborted) { setRows(appointments); setError(""); setAccessError(null); }
      }).catch(error => {
        if (controller.signal.aborted) return;
        setRows([]); setSelected(null); setNotice("");
        setError(error instanceof StaffApiError ? error.message : "Unable to reach the appointment service. Please try again.");
        if (error instanceof StaffApiError && (error.status === 401 || error.status === 403)) {
          setAccessError(error.status); setSearch(""); setDoctor("");
        } else setAccessError(null);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, preview, revision]);

  const counts = (value: AppointmentStatus) => rows.filter(row => row.status === value).length;
  const query = search.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => (status === "all" || row.status === status) && (!doctor || row.doctorId === doctor) && (!date || clinicDate(row.startAt) === date) && (!query || `${row.patientName} ${row.patientPhone} ${row.doctorName} ${row.id}`.toLocaleLowerCase().includes(query)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 6, currentPage * 6);
  function clearFilters() { setSearch(""); setStatus("all"); setDoctor(""); setDate(""); setPage(1); }

  function refresh() { setLoading(true); setRows([]); setSelected(null); setError(""); setRevision(value => value + 1); }
  function mutationError(error: StaffApiError) {
    setSelected(null); setNotice(""); setRows([]); setSearch(""); setDoctor("");
    if (error.status === 401 || error.status === 403) { setAccessError(error.status); setError(error.message); }
    else { refresh(); setNotice(error.message); }
  }
  if (accessError) return <section className={styles.empty} role="alert"><StaffIcon name="user" /><h2>{accessError === 401 ? "401 - Sign-in required" : "403 - Access denied"}</h2><p>{error}</p>{accessError === 401 && onSessionExpired ? <button className={styles.primary} onClick={onSessionExpired}>Sign in again</button> : <button className={styles.secondary} disabled={loading} onClick={refresh}>{loading ? "Checking access..." : "Check access again"}</button>}</section>;

  return <div className={styles.workspace}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>A LITTLE MORE ORGANIZED</p><h2>Every appointment.<br className={styles.mobileBreak} /> <em>A little more care.</em></h2><p>Review bookings, welcome patients, and keep your clinic moving.</p></div><span className={styles.introIcon}><StaffIcon name="calendar" /></span></section>
    <div className={styles.stats} aria-label="Appointment summary">
      {([{ label: "Total appointments", value: rows.length, icon: "calendar", filter: "all", note: "In the loaded appointments" }, { label: "Completed appointments", value: counts("completed"), icon: "check", filter: "completed", note: "Successfully completed visits" }, { label: "Cancelled appointments", value: counts("cancelled"), icon: "close", filter: "cancelled", note: "Bookings that were cancelled" }, { label: "Pending appointments", value: counts("requested"), icon: "clock", filter: "requested", note: "Awaiting confirmation" }] as const).map(stat => <button key={stat.label} className={styles.stat} onClick={() => { setStatus(stat.filter); setPage(1); }} aria-pressed={status === stat.filter}><span className={styles.statTop}>{stat.label}<span className={`${styles.statIcon} ${styles[stat.filter]}`}><StaffIcon name={stat.icon} /></span></span><strong>{loading ? "—" : String(stat.value).padStart(2, "0")}</strong><small>{stat.note}<span aria-hidden="true">↗</span></small></button>)}
    </div>
    {notice && <div className={styles.notice} role="status"><StaffIcon name="check" /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><StaffIcon name="close" /></button></div>}
    <section className={styles.list} aria-labelledby="appointment-list-title">
      <div className={styles.listHeading}><div><h3 id="appointment-list-title">Appointment list <span>{rows.length}</span></h3><p>Latest 100 appointments at most. Counts and filters apply to loaded records only.</p></div><button className={styles.secondary} disabled={loading} onClick={() => { if (preview) { setRows(sampleAppointments); setNotice("Sample appointments reset."); } else refresh(); }}><StaffIcon name="refresh" />{preview ? "Reset preview" : "Refresh"}</button></div>
      <div className={styles.tabs} aria-label="Filter by appointment status">{(["all", ...Object.keys(statusLabels)] as (AppointmentStatus | "all")[]).map(value => <button key={value} aria-pressed={status === value} className={status === value ? styles.activeTab : ""} onClick={() => { setStatus(value); setPage(1); }}>{value === "all" ? "All appointments" : statusLabels[value]}<span>{value === "all" ? rows.length : counts(value)}</span></button>)}</div>
      <div className={styles.filters}><label className={styles.search}><StaffIcon name="search" /><input aria-label="Search appointments" placeholder="Search patient, phone or appointment ID…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><select aria-label="Filter by doctor" value={doctor} onChange={e => { setDoctor(e.target.value); setPage(1); }}><option value="">All doctors</option>{Array.from(new Map(rows.map(row => [row.doctorId, row.doctorName]))).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><input aria-label="Filter by appointment date" type="date" value={date} onChange={e => { setDate(e.target.value); setPage(1); }} />{(search || date || doctor || status !== "all") && <button className={styles.textButton} onClick={clearFilters}>Clear filters</button>}</div>
      {error && <div className={styles.error} role="alert">{error} <button className={styles.textButton} onClick={refresh}>Try again</button></div>}
      {loading ? <div className={styles.empty} role="status"><StaffIcon name="refresh" /><p>Loading appointments…</p></div> : error ? null : <>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Date & time</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><div className={styles.patient}><span className={styles.avatar}>{initials(row.patientName)}</span><div><strong>{row.patientName}</strong><small>{row.patientPhone}</small></div></div></td><td><strong>{row.doctorName}</strong></td><td><strong>{displayDate(row.startAt)}</strong><small>{displayTime(row.startAt)} · UTC+7</small></td><td><StatusBadge status={row.status} /></td><td><button className={row.status === "requested" && allowConfirmation && !preview ? styles.reviewButton : styles.detailButton} aria-label={`${row.status === "requested" && allowConfirmation && !preview ? "Review booking" : "View details"} for ${row.patientName}`} onClick={() => setSelected(row)}>{row.status === "requested" && allowConfirmation && !preview ? "Review booking" : "View details"}</button></td></tr>)}</tbody></table></div>
        <div className={styles.appointmentCards} aria-label="Appointments">
          {visible.map(row => {
            const action = row.status === "requested" && allowConfirmation && !preview ? "Review booking" : "View details";
            return <article key={row.id} className={styles.appointmentCard}>
              <div className={styles.cardPatient}><div className={styles.patient}><span className={styles.avatar}>{initials(row.patientName)}</span><div><h3>{row.patientName}</h3><p>{row.patientPhone}</p></div></div><StatusBadge status={row.status} /></div>
              <dl className={styles.cardDetails}><div><dt>Doctor</dt><dd>{row.doctorName}</dd></div><div><dt>Date & time</dt><dd>{displayDate(row.startAt)}<small>{displayTime(row.startAt)} &middot; UTC+7</small></dd></div></dl>
              <button className={action === "Review booking" ? styles.reviewButton : styles.detailButton} aria-label={action + " for " + row.patientName} onClick={() => setSelected(row)}>{action}</button>
            </article>;
          })}
        </div>
        {!visible.length && <div className={styles.empty}><StaffIcon name="calendar" /><h3>{rows.length ? "No matching appointments" : "No appointments yet"}</h3><p>{rows.length ? "Try another search or adjust your filters." : "New patient bookings will appear here."}</p>{rows.length > 0 && <button className={styles.secondary} onClick={clearFilters}>Clear filters</button>}</div>}
        <div className={styles.pagination}><span>{filtered.length ? `Showing ${(currentPage - 1) * 6 + 1}–${Math.min(currentPage * 6, filtered.length)} of ${filtered.length} appointments` : "0 appointments"}</span><div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button><span>Page {currentPage} of {pageCount}</span><button aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>›</button></div></div>
      </>}
    </section>
    {selected && <AppointmentDialog appointment={selected} token={token} allowConfirmation={allowConfirmation && !preview} onClose={() => setSelected(null)} onFailure={mutationError} onConfirmed={() => { refresh(); setNotice("Booking confirmed. Reloading the latest appointments."); }} />}
  </div>;
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}><i />{statusLabels[status]}</span>;
}

function AppointmentDialog({ appointment, token, allowConfirmation, onClose, onConfirmed, onFailure }: { appointment: Appointment; token: string; allowConfirmation: boolean; onClose: () => void; onConfirmed: () => void; onFailure: (error: StaffApiError) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mutation = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  async function confirm() {
    if (mutation.current || !allowConfirmation || appointment.status !== "requested") return;
    mutation.current = true; setBusy(true); setError("");
    try {
      await confirmStaffAppointment(appointment, token);
      onConfirmed();
    } catch (error) {
      if (error instanceof StaffApiError && [401, 403, 404, 409].includes(error.status)) { onFailure(error); return; }
      // A disconnected PATCH may already have committed. Require a fresh GET before retrying.
      setUncertain(true);
      setError(error instanceof StaffApiError ? error.message : "The update could not be verified. Refresh the list to check the latest status before trying again.");
    } finally { mutation.current = false; setBusy(false); }
  }
  const canConfirm = allowConfirmation && appointment.status === "requested";
  return <dialog className={styles.dialog} ref={dialog} aria-labelledby="staff-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button autoFocus className={styles.close} aria-label="Close appointment details" disabled={busy} onClick={onClose}><StaffIcon name="close" /></button>
    <span className={styles.featureIcon}><StaffIcon name="calendar" /></span>
    <p className={styles.eyebrow}>APPOINTMENT DETAILS</p>
    <h2 id="staff-dialog-title">{canConfirm ? "Let’s confirm their visit." : "A closer look at their visit."}</h2>
    <p className={styles.dialogDescription}>{canConfirm ? "Review the patient and appointment details before confirming." : "Patient and appointment details for your assigned doctor."}</p>
    <div className={styles.dialogPatient}><span className={styles.avatar}>{initials(appointment.patientName)}</span><div><strong>{appointment.patientName}</strong><small>{appointment.patientPhone}</small></div><StatusBadge status={appointment.status} /></div>
    <dl className={styles.details}><div><dt>Doctor</dt><dd>{appointment.doctorName}</dd></div><div><dt>Appointment date</dt><dd>{displayDate(appointment.startAt)}</dd></div><div><dt>Appointment time</dt><dd>{displayTime(appointment.startAt)} <small>(Asia/Ho_Chi_Minh · UTC+7)</small></dd></div><div className={styles.reference}><dt>Appointment ID</dt><dd>{appointment.id}</dd></div></dl>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <div className={styles.dialogActions}><button className={styles.secondary} disabled={busy} onClick={onClose}>Close</button>{uncertain ? <button className={styles.primary} onClick={() => onFailure(new StaffApiError(409, "Review the refreshed appointment status before retrying."))}>Refresh appointments</button> : canConfirm && <button className={styles.primary} disabled={busy} onClick={confirm}><StaffIcon name="check" />{busy ? "Confirming…" : "Confirm booking"}</button>}</div>
  </dialog>;
}
