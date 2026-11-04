"use client";

import { useId } from "react";
import { weekdays, type WeeklyScheduleErrors, type WorkingInterval } from "./weekly-schedule-utils";
import styles from "./weekly-schedule.module.css";

export type { WorkingInterval, WeeklyScheduleValue, WeeklyScheduleErrors } from "./weekly-schedule-utils";
export { validateWeeklySchedule, hasWeeklyErrors } from "./weekly-schedule-utils";
export type WeeklyScheduleEditorProps = {
  value: WorkingInterval[];
  onChange: (value: WorkingInterval[]) => void;
  disabled?: boolean;
  errors?: WeeklyScheduleErrors;
};

/** Controlled fields, without a nested form: FE1 owns registration and its submit. */
export function WeeklyScheduleEditor({ value, onChange, disabled = false, errors }: WeeklyScheduleEditorProps) {
  const id = useId();
  function update(index: number, field: "startTime" | "endTime", time: string) {
    onChange(value.map((item, i) => i === index ? { ...item, [field]: time } : item));
  }
  return <div className={styles.editor}>
    <p className={styles.help}>Weekly working hours · Vietnam (UTC+7). Add one or more intervals per day; each interval must be a multiple of 30 minutes.</p>
    {errors?.summary && <p role="alert" className={styles.error}>{errors.summary}</p>}
    {weekdays.map((day, dayIndex) => {
      const dayOfWeek = dayIndex + 1;
      const rows = value.map((interval, index) => ({ interval, index })).filter(({ interval }) => interval.dayOfWeek === dayOfWeek);
      return <fieldset key={day} className={styles.day} disabled={disabled}>
        <legend><label className={styles.dayToggle}><input type="checkbox" checked={rows.length > 0}
          onChange={event => onChange(event.target.checked ? [...value, { dayOfWeek, startTime: "", endTime: "" }] : value.filter(item => item.dayOfWeek !== dayOfWeek))} />{day}</label></legend>
        {!rows.length && <span className={styles.help}>Not working</span>}
        {rows.map(({ interval, index }, rowIndex) => <div key={index} className={styles.row}>
          <div><label htmlFor={`${id}-${index}-start`}>Start time <span className={styles.srOnly}>{day}, interval {rowIndex + 1}</span></label>
            <input id={`${id}-${index}-start`} type="time" step={60} value={interval.startTime} required
              aria-invalid={Boolean(errors?.intervals[index])} aria-describedby={errors?.intervals[index] ? `${id}-${index}-error` : undefined}
              onChange={event => update(index, "startTime", event.target.value)} /></div>
          <div><label htmlFor={`${id}-${index}-end`}>End time <span className={styles.srOnly}>{day}, interval {rowIndex + 1}</span></label>
            <input id={`${id}-${index}-end`} type="time" step={60} value={interval.endTime} required
              aria-invalid={Boolean(errors?.intervals[index])} aria-describedby={errors?.intervals[index] ? `${id}-${index}-error` : undefined}
              onChange={event => update(index, "endTime", event.target.value)} /></div>
          <button className={styles.secondary} type="button" aria-label={`Remove ${day} interval ${rowIndex + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button>
          {errors?.intervals[index] && <p id={`${id}-${index}-error`} className={styles.rowError}>{errors.intervals[index]}</p>}
        </div>)}
        {rows.length > 0 && <button className={styles.secondary} type="button" onClick={() => onChange([...value, { dayOfWeek, startTime: "", endTime: "" }])}>Add interval for {day}</button>}
      </fieldset>;
    })}
  </div>;
}
