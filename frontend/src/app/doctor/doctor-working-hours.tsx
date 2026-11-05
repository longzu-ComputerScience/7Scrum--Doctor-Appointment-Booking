"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DoctorScheduleEditor } from "./doctor-schedule-editor";
import { WeeklyScheduleEditor, validateWeeklySchedule, hasWeeklyErrors, type WorkingInterval, type WeeklyScheduleErrors } from "./weekly-schedule-editor";
import { getDoctorSchedule, putDoctorSchedule, scheduleConflicts, scheduleValidationErrors } from "./schedule-api";
import { apiMessage, ContractApiError } from "@/lib/contract-api";
import { formatScheduleDay, formatScheduleTime, vietnamDate } from "@/lib/schedule-time";
import styles from "./doctor-workspace.module.css";

/** FE1 onboarding wrapper. Both first-time setup and updates reuse FE2's editor. */
export function DoctorWorkingHours({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [status, setStatus] = useState<"loading" | "existing" | "setup" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getDoctorSchedule(token, controller.signal).then(schedule => {
      if (!controller.signal.aborted) setStatus(schedule.weeklyIntervals.length ? "existing" : "setup");
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (failure instanceof ContractApiError && failure.status === 404) setStatus("setup");
      else { setError(failure); setStatus("error"); }
    });
    return () => controller.abort();
  }, [token, revision]);
  const reload = () => { setStatus("loading"); setRevision(v => v + 1); };
  if (status === "loading") return <section className={styles.card} role="status">Loading working hours…</section>;
  if (status === "error") return <section className={styles.error} role="alert"><p>{apiMessage(error)}</p><button className={styles.secondary} onClick={reload}>Try again</button></section>;
  if (status === "existing") return <DoctorScheduleEditor token={token} onSaved={onSaved} />;
  return <InitialSchedule token={token} onReload={reload} onSaved={() => { setStatus("existing"); onSaved(); }} />;
}

function InitialSchedule({ token, onReload, onSaved }: { token: string; onReload: () => void; onSaved: () => void }) {
  const [hours, setHours] = useState<WorkingInterval[]>([]);
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<WeeklyScheduleErrors>({ intervals: {} });
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || uncertain) return;
    const validation = validateWeeklySchedule(hours, date); setErrors(validation); setError(null);
    if (hasWeeklyErrors(validation)) return;
    lock.current = true; setSaving(true);
    const controller = new AbortController(); request.current = controller;
    try {
      await putDoctorSchedule(token, { weeklyIntervals: hours, effectiveDate: date }, controller.signal);
      if (!controller.signal.aborted) onSaved();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure); setErrors(scheduleValidationErrors(failure));
      if (!(failure instanceof ContractApiError) || failure.uncertain) setUncertain(true);
    } finally { lock.current = false; if (!controller.signal.aborted) setSaving(false); }
  }
  const forbidden = error instanceof ContractApiError && (error.status === 401 || error.status === 403);
  return <section className={styles.card}><span className={styles.eyebrow}>GET YOUR PRACTICE READY</span><h2>Set up your working hours</h2>
    <p className={styles.help}>Choose the days and times you see patients. Your first schedule starts from a future date in Vietnam.</p>
    {Boolean(error) && <div className={styles.error} role="alert"><p>{apiMessage(error)}</p>
      {scheduleConflicts(error).map(conflict => <p key={conflict.appointmentId}>{formatScheduleDay(conflict.startAt)} · {formatScheduleTime(conflict.startAt)}–{formatScheduleTime(conflict.endAt)} · {conflict.appointmentId}</p>)}
      {uncertain && <p>The schedule may have been saved. Reload working hours to verify before trying again.</p>}</div>}
    <form onSubmit={save} noValidate aria-busy={saving}>
      <WeeklyScheduleEditor value={hours} onChange={setHours} errors={errors} disabled={saving || uncertain || forbidden} />
      <label className={styles.dateField}>Effective date · Vietnam<input type="date" value={date} min={vietnamDate()}
        onChange={e => setDate(e.target.value)} disabled={saving || uncertain || forbidden} required aria-invalid={Boolean(errors.effectiveDate)} aria-describedby={errors.effectiveDate ? "initial-date-error" : undefined} /></label>
      {errors.effectiveDate && <p className={styles.error} id="initial-date-error">{errors.effectiveDate}</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={saving || uncertain || forbidden}>{saving ? "Saving…" : "Save working hours"}</button>
        <button className={styles.secondary} type="button" disabled={saving} onClick={onReload}>Reload working hours</button></div>
    </form>
  </section>;
}
