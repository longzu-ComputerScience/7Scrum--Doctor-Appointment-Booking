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
      setLoaded(true);
      setLoading(false);
      setError(null);
      setUncertain(false);
      setConflicts([]);
      setErrors({ intervals: {} });
    }).catch(failure => {
      if (!controller.signal.aborted) {
        setError(failure);
        setLoading(false);
        setLoaded(false);
      }
    });
    return () => controller.abort();
  }, [token, revision]);

  const forbidden = error instanceof ContractApiError && (error.status === 401 || error.status === 403);
  const disabled = !token || loading || !loaded || saving || uncertain || forbidden;

  function reload() {
    if (lock.current) return;
    setLoading(true);
    setNotice("");
    setRevision(v => v + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || disabled) return;
    const validation = validateWeeklySchedule(value.weeklyIntervals, value.effectiveDate);
    setErrors(validation);
    setNotice("");
    setError(null);
    setConflicts([]);
    if (hasWeeklyErrors(validation)) {
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    lock.current = true;
    setSaving(true);
    const controller = new AbortController();
    mutation.current = controller;
    let saved: WeeklyScheduleValue | undefined;
    try {
      saved = await putDoctorSchedule(token, value, controller.signal);
      if (controller.signal.aborted) return;
      setValue({ ...saved, effectiveDate: "" });
      setNotice(`Weekly schedule saved. Effective ${formatScheduleDay(saved.effectiveDate + "T00:00:00+07:00")}.`);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      setConflicts(scheduleConflicts(failure));
      setErrors(scheduleValidationErrors(failure));
      if (!(failure instanceof ContractApiError) || failure.uncertain) setUncertain(true);
      requestAnimationFrame(() => summary.current?.focus());
    } finally {
      lock.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
    if (saved && !controller.signal.aborted) onSaved?.(saved);
  }

  return (
    <section className={styles.panel} aria-label="Doctor weekly schedule">
      {loading && <p role="status">Loading weekly schedule…</p>}
      <form onSubmit={save} noValidate aria-busy={loading || saving}>
        {(Boolean(error) || hasWeeklyErrors(errors)) && (
          <div className={styles.errorBox} role="alert" tabIndex={-1} ref={summary}>
            {error ? <p>{apiMessage(error)}</p> : <p>Check the working hours and effective date below.</p>}
            {errors.effectiveDate && <a href="#schedule-effective-date">{errors.effectiveDate}</a>}
            {error instanceof ContractApiError && error.status === 409 && (
              <>
                <p>Adjust your draft before saving again. This editor does not cancel, move or overwrite appointments.</p>
                {conflicts.length > 0 ? (
                  <ul>
                    {conflicts.map(conflict => (
                      <li key={conflict.appointmentId}>
                        {formatScheduleDay(conflict.startAt)} · {formatScheduleTime(conflict.startAt)}–{formatScheduleTime(conflict.endAt)} · Appointment {conflict.appointmentId}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Conflict details were not supplied in the documented format. Reload or contact support.</p>
                )}
              </>
            )}
          </div>
        )}
        {!forbidden && loaded && (
          <WeeklyScheduleEditor
            value={value.weeklyIntervals}
            disabled={disabled}
            errors={errors}
            onChange={weeklyIntervals => {
              setValue(current => ({ ...current, weeklyIntervals }));
              setErrors({ intervals: {} });
              setNotice("");
            }}
          >
            {/* Top Save & Effective Date Workflow Card (No excessive scrolling) */}
            <div className={styles.saveWorkflowCard}>
              <div className={styles.saveControlsColumn}>
                <div className={styles.effectiveDateField}>
                  <label htmlFor="schedule-effective-date" className={styles.effectiveDateLabel}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>Effective Date (Vietnam)</span>
                  </label>
                  <input
                    type="date"
                    id="schedule-effective-date"
                    value={value.effectiveDate}
                    min={vietnamDate()}
                    disabled={disabled}
                    required
                    aria-invalid={Boolean(errors.effectiveDate)}
                    aria-describedby={errors.effectiveDate ? "schedule-effective-error" : undefined}
                    className={`${styles.effectiveDateInput} ${errors.effectiveDate ? styles.timeInputInvalid : ""}`}
                    onChange={event => {
                      setValue(current => ({ ...current, effectiveDate: event.target.value }));
                      setErrors(current => ({ ...current, effectiveDate: undefined }));
                      setNotice("");
                    }}
                  />
                  {errors.effectiveDate && (
                    <p id="schedule-effective-error" className={styles.rowErrorText} role="alert">
                      {errors.effectiveDate}
                    </p>
                  )}
                </div>

                <div className={styles.saveButtonWrapper}>
                  <button type="submit" className={styles.primarySaveBtn} disabled={disabled}>
                    {saving ? (
                      <>
                        <span className={styles.btnSpinner} aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Save weekly schedule
                      </>
                    )}
                  </button>
                </div>
              </div>

              {notice && (
                <div className={styles.saveNoticeSuccess} role="status">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{notice}</span>
                </div>
              )}

              {uncertain && (
                <p className={styles.notice} role="alert">
                  The update may have been saved. Reload the saved schedule and verify it before making another change. No automatic retry will be sent.
                </p>
              )}

              <div className={styles.saveMetaRow}>
                <p className={styles.saveHelpHint}>Changes apply to future appointment slots.</p>
                <div className={styles.reloadWrapper}>
                  <button
                    className={styles.reloadBtnText}
                    type="button"
                    disabled={loading || saving}
                    onClick={reload}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    <span>{uncertain ? "Reload to verify" : "Reload saved"}</span>
                  </button>
                </div>
              </div>
            </div>
          </WeeklyScheduleEditor>
        )}
      </form>
    </section>
  );
}
