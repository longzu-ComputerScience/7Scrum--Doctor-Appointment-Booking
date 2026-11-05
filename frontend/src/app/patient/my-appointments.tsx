"use client";

import { useEffect, useState } from "react";
import { apiMessage } from "@/lib/contract-api";
import { loadPatientAppointments, type PatientAppointment } from "@/lib/patient-appointments";
import { formatDay, formatTime } from "../doctors/[id]/book/booking-utils";
import styles from "./my-appointments.module.css";

type Snapshot =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; appointments: PatientAppointment[] };

function AppointmentList({ rows }: { rows: PatientAppointment[] }) {
  return <div className={styles.list}>{rows.map(item => (
    <article key={item.id} className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.doctorIcon} aria-hidden="true">✚</div>
        <div className={styles.doctor}>
          <h3>{item.doctorName}</h3>
          <p>{item.specialty}</p>
        </div>
        <span className={`${styles.status} ${styles[item.status]}`}>{item.status}</span>
      </div>
      <div className={styles.details}>
        <div><span>Date</span><strong>{formatDay(item.startAt)}</strong></div>
        <div><span>Time (Vietnam)</span><strong>{formatTime(item.startAt)} – {formatTime(item.endAt)}</strong></div>
        <div><span>Location</span><strong>{[item.address, item.district].filter(Boolean).join(", ") || "Contact the clinic for details"}</strong></div>
        <div><span>Booking reference</span><strong className={styles.reference}>{item.bookingReference}</strong></div>
      </div>
    </article>
  ))}</div>;
}

export function MyAppointments({ token, onBook }: { token: string; onBook: () => void }) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot({ status: "loading" });
    void loadPatientAppointments(token, controller.signal)
      .then(appointments => { if (!controller.signal.aborted) setSnapshot({ status: "ready", appointments }); })
      .catch(error => { if (!controller.signal.aborted) setSnapshot({ status: "error", error }); });
    return () => controller.abort();
  }, [token, revision]);

  const retry = () => setRevision(value => value + 1);
  if (snapshot.status === "loading") {
    return <section className={styles.page}><p className={styles.notice} role="status">Loading your appointments…</p></section>;
  }
  if (snapshot.status === "error") {
    return <section className={styles.page}>
      <div className={styles.empty} role="alert"><h2>Could not load your appointments</h2>
        <p>{apiMessage(snapshot.error)}</p><button className={styles.button} onClick={retry}>Try again</button>
      </div>
    </section>;
  }

  const now = Date.now();
  const upcoming = snapshot.appointments.filter(item => item.status === "confirmed" && Date.parse(item.startAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const history = snapshot.appointments.filter(item => item.status !== "confirmed" || Date.parse(item.startAt) <= now)
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>YOUR CARE JOURNEY</p><h2>My appointments</h2>
        <p>View your confirmed visits and past booking records.</p></div>
      <button className={styles.refresh} onClick={retry} type="button">Refresh ↻</button>
    </div>
    {snapshot.appointments.length === 0 ? <div className={styles.empty}>
      <h3>No appointments yet</h3><p>Appointments you book will appear here.</p>
      <button className={styles.button} onClick={onBook}>Book an appointment</button>
    </div> : <>
      <section className={styles.section} aria-labelledby="upcoming-appointments-title">
        <h3 id="upcoming-appointments-title">Upcoming <span>{upcoming.length}</span></h3>
        {upcoming.length ? <AppointmentList rows={upcoming} /> : <p className={styles.notice}>No upcoming appointments.</p>}
      </section>
      <section className={styles.section} aria-labelledby="appointment-history-title">
        <h3 id="appointment-history-title">History <span>{history.length}</span></h3>
        {history.length ? <AppointmentList rows={history} /> : <p className={styles.notice}>No past or cancelled appointments.</p>}
      </section>
    </>}
  </div>;
}
