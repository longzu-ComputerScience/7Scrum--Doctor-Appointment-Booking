"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../auth/auth-provider";
import { fe1Request, parsePatientAppointments, type PatientAppointment } from "@/lib/fe1-api";
import { formatScheduleDay, formatScheduleTime } from "@/lib/schedule-time";
import styles from "./patient-appointments.module.css";

type State = { kind: "loading" | "error" | "ready"; rows: PatientAppointment[] };
type Filter = "upcoming" | "past" | "cancelled" | "all";

export function PatientAppointmentsView() {
  const { state } = useAuth();
  const [snapshot, setSnapshot] = useState<State>({ kind: "loading", rows: [] });
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const token = state.status === "ready" && state.identity.role === "patient"
    ? state.session.access_token : null;

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      setSnapshot(current => ({ ...current, kind: "loading" }));
      const payload = await fe1Request("/api/patient/appointments", { token, signal: controller.signal });
      if (!controller.signal.aborted) setSnapshot({ kind: "ready", rows: parsePatientAppointments(payload) });
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ kind: "error", rows: [] });
    });
    return () => controller.abort();
  }, [token, version]);

  if (!token) return <section className={styles.panel}><h2>My appointments</h2>
    <p>Sign in as a patient to view your booked visits.</p><Link className={styles.action} href="/patient/login">Sign in</Link></section>;

  const now = Date.now();
  const isUpcoming = (row: PatientAppointment) => row.status === "confirmed" && Date.parse(row.startAt) >= now;
  const rows = snapshot.rows.filter(row => filter === "all" || (
    filter === "upcoming" ? isUpcoming(row) :
    filter === "cancelled" ? row.status === "cancelled" :
    row.status !== "cancelled" && !isUpcoming(row)
  )).sort((a, b) => filter === "upcoming"
    ? Date.parse(a.startAt) - Date.parse(b.startAt)
    : Date.parse(b.startAt) - Date.parse(a.startAt));

  return <section className={styles.panel} aria-labelledby="appointments-title">
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>YOUR CARE TIMELINE</span><h2 id="appointments-title">My appointments</h2>
        <p>Confirmed visits and booking history, securely linked to your account.</p></div>
      <button className={styles.refresh} onClick={() => setVersion(value => value + 1)}>↻ Refresh</button>
    </div>
    <div className={styles.tabs} role="group" aria-label="Filter your appointments">
      {(["upcoming","past","cancelled","all"] as const).map(item =>
        <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
    </div>
    {snapshot.kind === "loading" && <div className={styles.empty} role="status">Loading your visits…</div>}
    {snapshot.kind === "error" && <div className={styles.empty} role="alert">
      Could not load appointments. Please try again.
      <button className={styles.action} onClick={() => setVersion(value => value + 1)}>Retry</button>
    </div>}
    {snapshot.kind === "ready" && !rows.length && <div className={styles.empty}>
      <span aria-hidden="true">✧</span><h3>No appointments in this view yet.</h3>
      <p>After a successful booking, your visit details will appear here.</p>
      <Link className={styles.action} href="/#book">Find a doctor</Link>
    </div>}
    {snapshot.kind === "ready" && rows.length > 0 && <div className={styles.grid}>
      {rows.map(row => <article className={styles.card} key={row.id}>
        <div className={styles.cardTop}>
          <span className={styles.doctorIcon} aria-hidden="true">{row.doctorName.trim().replace(/^BS\.|^Dr\./,"").trim().slice(0,1)}</span>
          <div><strong>{row.doctorName}</strong><small>{row.specialty}</small></div>
          <span className={styles.status} data-status={row.status}>{row.status}</span>
        </div>
        <div className={styles.details}>
          <div><span>Date</span><strong>{formatScheduleDay(row.startAt)}</strong></div>
          <div><span>Time (VN)</span><strong>{formatScheduleTime(row.startAt)} – {formatScheduleTime(row.endAt)}</strong></div>
          <div><span>Location</span><strong>{row.address} · {row.district}</strong></div>
          <div><span>Booking reference</span><strong className={styles.reference}>{row.bookingReference}</strong></div>
        </div>
      </article>)}
    </div>}
  </section>;
}
