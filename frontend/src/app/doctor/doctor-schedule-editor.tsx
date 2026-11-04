"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiMessage, ContractApiError } from "../../lib/contract-api";
import { formatScheduleDay, formatScheduleTime, vietnamDate } from "../../lib/schedule-time";
import { getDoctorSchedule, putDoctorSchedule, scheduleConflicts, scheduleValidationErrors, type ScheduleConflict } from "./schedule-api";
import { WeeklyScheduleEditor } from "./weekly-schedule-editor";
import { hasWeeklyErrors, validateWeeklySchedule, type WeeklyScheduleErrors, type WeeklyScheduleValue } from "./weekly-schedule-utils";
import styles from "./weekly-schedule.module.css";

export type DoctorScheduleEditorProps = { token: string; onSaved?: (value: WeeklyScheduleValue) => void };
/** FE1 mounts this inside its Doctor-only Dashboard; this component owns no auth wrapper. */
export function DoctorScheduleEditor(props: DoctorScheduleEditorProps) {
  return <ScheduleForm key={props.token} {...props} />;
}
function ScheduleForm({ token, onSaved }: DoctorScheduleEditorProps) {
  const [value, setValue] = useState<WeeklyScheduleValue>({ weeklyIntervals: [], effectiveDate: "" });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<WeeklyScheduleErrors>({ intervals: {} });
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    getDoctorSchedule(token, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setValue({ weeklyIntervals: data.weeklyIntervals, effectiveDate: "" });
      setLoaded(true); setLoading(false); setError(null); setUncertain(false); setConflicts([]); setErrors({ intervals: {} });
    }).catch(failure => {
      if (!controller.signal.aborted) { setError(failure); setLoading(false); setLoaded(false); }
    });
    return () => controller.abort();
  }, [token, revision]);
  const forbidden = error instanceof ContractApiError && (error.status === 401 || error.status === 403);
  const disabled = !token || loading || !loaded || saving || uncertain || forbidden;
  function reload() {
    if (lock.current) return;
    setLoading(true); setNotice(""); setRevision(v => v + 1);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || disabled) return;
    const validation = validateWeeklySchedule(value.weeklyIntervals, value.effectiveDate);
    setErrors(validation); setNotice(""); setError(null); setConflicts([]);
    if (hasWeeklyErrors(validation)) { requestAnimationFrame(() => summary.current?.focus()); return; }
    lock.current = true; setSaving(true);
    const controller = new AbortController(); mutation.current = controller;
    let saved: WeeklyScheduleValue | undefined;
    try {
      saved = await putDoctorSchedule(token, value, controller.signal);
      if (controller.signal.aborted) return;
      setValue({ ...saved, effectiveDate: "" });
      setNotice(`Weekly schedule saved. Effective ${formatScheduleDay(saved.effectiveDate + "T00:00:00+07:00")}.`);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure); setConflicts(scheduleConflicts(failure)); setErrors(scheduleValidationErrors(failure));
      if (!(failure instanceof ContractApiError) || failure.uncertain) setUncertain(true);
      requestAnimationFrame(() => summary.current?.focus());
    } finally { lock.current = false; if (!controller.signal.aborted) setSaving(false); }
    if (saved && !controller.signal.aborted) onSaved?.(saved);
  }
  return <section className={styles.panel} aria-label="Doctor weekly schedule">
    <h2>Weekly schedule</h2>
    <p className={styles.help}>Updates apply from a future Vietnam date. Existing appointments are preserved.</p>
    {loading && <p role="status">Loading weekly schedule…</p>}
    <form onSubmit={save} noValidate aria-busy={loading || saving}>
      {(Boolean(error) || hasWeeklyErrors(errors)) && <div className={styles.errorBox} role="alert" tabIndex={-1} ref={summary}>
        {error ? <p>{apiMessage(error)}</p> : <p>Check the working hours and effective date below.</p>}
        {errors.effectiveDate && <a href="#schedule-effective-date">{errors.effectiveDate}</a>}
        {error instanceof ContractApiError && error.status === 409 && <>
          <p>Adjust your draft before saving again. This editor does not cancel, move or overwrite appointments.</p>
          {conflicts.length > 0 ? <ul>{conflicts.map(conflict => <li key={conflict.appointmentId}>
            {formatScheduleDay(conflict.startAt)} · {formatScheduleTime(conflict.startAt)}–{formatScheduleTime(conflict.endAt)} · Appointment {conflict.appointmentId}
          </li>)}</ul> : <p>Conflict details were not supplied in the documented format. Reload or contact support.</p>}
        </>}
      </div>}
      {!forbidden && loaded && <>
        <WeeklyScheduleEditor value={value.weeklyIntervals} disabled={disabled} errors={errors}
          onChange={weeklyIntervals => { setValue(current => ({ ...current, weeklyIntervals })); setErrors({ intervals: {} }); setNotice(""); }} />
        <div className={styles.date}>
          <label htmlFor="schedule-effective-date">Effective date · Vietnam</label>
          <input type="date" id="schedule-effective-date" value={value.effectiveDate} min={vietnamDate()} disabled={disabled} required
            aria-invalid={Boolean(errors.effectiveDate)} aria-describedby={errors.effectiveDate ? "schedule-effective-error" : undefined}
            onChange={event => { setValue(current => ({ ...current, effectiveDate: event.target.value })); setErrors(current => ({ ...current, effectiveDate: undefined })); setNotice(""); }} />
          {errors.effectiveDate && <p id="schedule-effective-error" className={styles.error}>{errors.effectiveDate}</p>}
        </div>
        <button type="submit" className={styles.primary} disabled={disabled}>{saving ? "Saving schedule…" : "Save weekly schedule"}</button>
      </>}
      {uncertain && <p className={styles.notice} role="alert">The update may have been saved. Reload the saved schedule and verify it before making another change. No automatic retry will be sent.</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      <div className={styles.actions}><button className={styles.secondary} type="button" disabled={loading || saving} onClick={reload}>{uncertain ? "Reload schedule to verify" : "Reload saved schedule"}</button></div>
    </form>
  </section>;
}
