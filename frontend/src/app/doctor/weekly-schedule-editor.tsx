"use client";

import { useId, useState, type ReactNode } from "react";
import {
  calculateWeeklyStats,
  copyDayIntervals,
  formatDuration,
  getTimeOptions,
  minutes,
  weekdayShortNames,
  weekdays,
  type WeeklyScheduleErrors,
  type WorkingInterval,
} from "./weekly-schedule-utils";
import styles from "./weekly-schedule.module.css";

export type { WorkingInterval, WeeklyScheduleValue, WeeklyScheduleErrors } from "./weekly-schedule-utils";
export { validateWeeklySchedule, hasWeeklyErrors } from "./weekly-schedule-utils";

export type WeeklyScheduleEditorProps = {
  value: WorkingInterval[];
  onChange: (value: WorkingInterval[]) => void;
  disabled?: boolean;
  errors?: WeeklyScheduleErrors;
  children?: ReactNode;
};

type QuickEditState = {
  index: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
} | null;

export function WeeklyScheduleEditor({
  value,
  onChange,
  disabled = false,
  errors,
  children,
}: WeeklyScheduleEditorProps) {
  const baseId = useId();
  const [activeIntervalIndex, setActiveIntervalIndex] = useState<number | null>(null);
  const [copySourceDay, setCopySourceDay] = useState<number | null>(null);
  const [copyTargetDays, setCopyTargetDays] = useState<number[]>([]);
  const [quickEdit, setQuickEdit] = useState<QuickEditState>(null);

  // Calculate dynamic hour range for visual calendar
  let minHour = 7;
  let maxHour = 20;

  for (const interval of value) {
    const startMin = minutes(interval.startTime);
    const endMin = minutes(interval.endTime);
    if (Number.isFinite(startMin)) {
      const h = Math.floor(startMin / 60);
      if (h < minHour) minHour = Math.max(0, h);
    }
    if (Number.isFinite(endMin)) {
      const h = Math.ceil(endMin / 60);
      if (h > maxHour) maxHour = Math.min(24, h);
    }
  }

  const hoursList: number[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    hoursList.push(h);
  }

  const weeklyStats = calculateWeeklyStats(value);

  function updateInterval(index: number, field: "startTime" | "endTime", newTime: string) {
    onChange(
      value.map((item, i) => (i === index ? { ...item, [field]: newTime } : item))
    );
  }

  function removeInterval(index: number) {
    onChange(value.filter((_, i) => i !== index));
    if (activeIntervalIndex === index) setActiveIntervalIndex(null);
    if (quickEdit?.index === index) setQuickEdit(null);
  }

  function addIntervalForDay(dayOfWeek: number) {
    const existing = value.filter((item) => item.dayOfWeek === dayOfWeek);
    let defaultStart = "09:00";
    let defaultEnd = "17:00";

    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      const lastEndMin = minutes(last.endTime);
      if (Number.isFinite(lastEndMin) && lastEndMin < 22 * 60) {
        const nextStartMin = Math.min(23 * 60, lastEndMin + 60);
        const nextEndMin = Math.min(23 * 60 + 30, nextStartMin + 180);
        const pad = (n: number) => String(n).padStart(2, "0");
        defaultStart = `${pad(Math.floor(nextStartMin / 60))}:${pad(nextStartMin % 60)}`;
        defaultEnd = `${pad(Math.floor(nextEndMin / 60))}:${pad(nextEndMin % 60)}`;
      }
    }

    onChange([...value, { dayOfWeek, startTime: defaultStart, endTime: defaultEnd }]);
  }

  function toggleDay(dayOfWeek: number, enabled: boolean) {
    if (enabled) {
      onChange([...value, { dayOfWeek, startTime: "09:00", endTime: "17:00" }]);
    } else {
      onChange(value.filter((item) => item.dayOfWeek !== dayOfWeek));
      if (copySourceDay === dayOfWeek) setCopySourceDay(null);
    }
  }

  function openCopyPopover(dayOfWeek: number) {
    if (copySourceDay === dayOfWeek) {
      setCopySourceDay(null);
      setCopyTargetDays([]);
    } else {
      setCopySourceDay(dayOfWeek);
      // Default to weekdays 1-5 excluding source
      const defaultTargets = [1, 2, 3, 4, 5].filter((d) => d !== dayOfWeek);
      setCopyTargetDays(defaultTargets);
    }
  }

  function applyCopy() {
    if (copySourceDay === null || !copyTargetDays.length) return;
    const updated = copyDayIntervals(value, copySourceDay, copyTargetDays);
    onChange(updated);
    setCopySourceDay(null);
    setCopyTargetDays([]);
  }

  function handleSelectPreset(preset: "weekdays" | "all") {
    if (copySourceDay === null) return;
    if (preset === "weekdays") {
      setCopyTargetDays([1, 2, 3, 4, 5].filter((d) => d !== copySourceDay));
    } else {
      setCopyTargetDays([1, 2, 3, 4, 5, 6, 7].filter((d) => d !== copySourceDay));
    }
  }

  function toggleCopyTarget(day: number) {
    setCopyTargetDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  return (
    <div className={styles.splitLayout}>
      {/* ------------------------------------------------------------------- */}
      {/* Left Panel: Availability Settings & Working Hours Form              */}
      {/* ------------------------------------------------------------------- */}
      <section className={styles.settingsCard} aria-label="Weekly availability settings">
        <header className={styles.panelHeader}>
          <span className={styles.eyebrow}>Recurring Availability</span>
          <h3 className={styles.panelTitle}>Weekly Working Hours</h3>
          <p className={styles.helpText}>
            Set your routine availability for patient appointments in Vietnam. Each interval must be at least 30 minutes.
          </p>
          <span className={styles.timezoneBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Asia/Ho_Chi_Minh (UTC+7)
          </span>
        </header>

        {/* Top Save Workflow Bar (Accessible without excessive scrolling) */}
        {children && <div className={styles.saveWorkflowBar}>{children}</div>}

        {errors?.summary && (
          <p role="alert" className={styles.errorBox}>
            {errors.summary}
          </p>
        )}

        <div className={styles.daysContainer}>
          {weekdays.map((dayName, dayIndex) => {
            const dayOfWeek = dayIndex + 1;
            const dayIntervals = value
              .map((interval, index) => ({ interval, index }))
              .filter(({ interval }) => interval.dayOfWeek === dayOfWeek);
            const isEnabled = dayIntervals.length > 0;
            const isHighlighted = activeIntervalIndex !== null && dayIntervals.some(({ index }) => index === activeIntervalIndex);

            return (
              <fieldset
                key={dayName}
                className={`${styles.dayCard} ${isEnabled ? styles.dayCardActive : ""} ${isHighlighted ? styles.dayCardHighlight : ""}`}
                disabled={disabled}
              >
                <div className={styles.dayHeader}>
                  <label className={styles.dayToggleLabel}>
                    <span className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={disabled}
                        aria-label={`Enable working hours for ${dayName}`}
                        onChange={(e) => toggleDay(dayOfWeek, e.target.checked)}
                      />
                      <span className={styles.slider} />
                    </span>
                    <span>{dayName}</span>
                  </label>

                  {isEnabled ? (
                    <div className={styles.dayActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title={`Copy ${dayName} hours to other days`}
                        aria-label={`Copy ${dayName} hours to other days`}
                        onClick={() => openCopyPopover(dayOfWeek)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span className={styles.dayStatusOff}>Unavailable</span>
                  )}
                </div>

                {/* Copy Hours Popover */}
                {copySourceDay === dayOfWeek && (
                  <div className={styles.copyPopover} role="dialog" aria-label={`Copy ${dayName} hours`}>
                    <div className={styles.copyPopoverHeader}>
                      Copy {dayName} hours to:
                    </div>
                    <div className={styles.copyPresets}>
                      <button
                        type="button"
                        className={styles.copyPresetBtn}
                        onClick={() => handleSelectPreset("weekdays")}
                      >
                        Mon – Fri
                      </button>
                      <button
                        type="button"
                        className={styles.copyPresetBtn}
                        onClick={() => handleSelectPreset("all")}
                      >
                        All 7 Days
                      </button>
                    </div>
                    <div className={styles.copyCheckboxes}>
                      {weekdays.map((targetName, targetIdx) => {
                        const targetDayNum = targetIdx + 1;
                        if (targetDayNum === dayOfWeek) return null;
                        const isChecked = copyTargetDays.includes(targetDayNum);
                        return (
                          <label key={targetName} className={styles.copyCheckboxLabel}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCopyTarget(targetDayNum)}
                            />
                            <span>{weekdayShortNames[targetIdx]}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className={styles.copyActions}>
                      <button
                        type="button"
                        className={styles.copyCancelBtn}
                        onClick={() => setCopySourceDay(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.copyApplyBtn}
                        onClick={applyCopy}
                        disabled={copyTargetDays.length === 0}
                      >
                        Apply hours
                      </button>
                    </div>
                  </div>
                )}

                {/* Interval Rows */}
                {isEnabled && (
                  <div className={styles.intervalRows}>
                    {dayIntervals.map(({ interval, index }, rowIdx) => {
                      const startMin = minutes(interval.startTime);
                      const endMin = minutes(interval.endTime);
                      const duration = Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin
                        ? formatDuration(endMin - startMin)
                        : null;
                      const hasRowError = Boolean(errors?.intervals[index]);

                      return (
                        <div
                          key={index}
                          className={`${styles.intervalRow} ${activeIntervalIndex === index ? styles.intervalRowHighlight : ""}`}
                        >
                          <div className={styles.intervalControls}>
                            <div className={styles.timeInputWrapper}>
                              <select
                                id={`${baseId}-${index}-start`}
                                value={interval.startTime}
                                disabled={disabled}
                                aria-label={`${dayName} interval ${rowIdx + 1} start time`}
                                aria-invalid={hasRowError}
                                className={`${styles.timeSelect} ${hasRowError ? styles.timeInputInvalid : ""}`}
                                onFocus={() => setActiveIntervalIndex(index)}
                                onChange={(e) => updateInterval(index, "startTime", e.target.value)}
                              >
                                {getTimeOptions(interval.startTime).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <span className={styles.timeSeparator}>–</span>

                            <div className={styles.timeInputWrapper}>
                              <select
                                id={`${baseId}-${index}-end`}
                                value={interval.endTime}
                                disabled={disabled}
                                aria-label={`${dayName} interval ${rowIdx + 1} end time`}
                                aria-invalid={hasRowError}
                                className={`${styles.timeSelect} ${hasRowError ? styles.timeInputInvalid : ""}`}
                                onFocus={() => setActiveIntervalIndex(index)}
                                onChange={(e) => updateInterval(index, "endTime", e.target.value)}
                              >
                                {getTimeOptions(interval.endTime).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {duration && <span className={styles.durationBadge}>{duration}</span>}

                            <button
                              type="button"
                              className={styles.removeBtn}
                              aria-label={`Remove ${dayName} interval ${rowIdx + 1}`}
                              title="Remove interval"
                              disabled={disabled}
                              onClick={() => removeInterval(index)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>

                          {hasRowError && (
                            <p className={styles.rowErrorText} role="alert">
                              {errors?.intervals[index]}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      className={styles.addIntervalBtn}
                      disabled={disabled}
                      onClick={() => addIntervalForDay(dayOfWeek)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add interval for {dayName}
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Right Panel: Google Calendar-Style Visual Weekly Calendar           */}
      {/* ------------------------------------------------------------------- */}
      <section className={styles.calendarCard} aria-label="Visual weekly calendar preview">
        <header className={styles.calendarTop}>
          <div className={styles.calendarHeading}>
            <h3>Weekly Calendar Preview</h3>
            <p>All 7 weekdays · Click any teal block to edit</p>
          </div>
          <div className={styles.weeklyStatsChip}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>
              <strong>{weeklyStats.totalHours}h</strong> / week · {weeklyStats.activeDaysCount} active days
            </span>
          </div>
        </header>

        <div className={styles.calendarViewport}>
          <div className={styles.calendarTable}>
            {/* Header: All 7 Weekday Columns (Mon–Sun) */}
            <div className={styles.calendarHeaderRow}>
              <div className={styles.cornerHeader} aria-hidden="true" />
              {weekdays.map((dayName, idx) => {
                const dayOfWeek = idx + 1;
                const dayIntervals = value.filter((item) => item.dayOfWeek === dayOfWeek);
                const hasHours = dayIntervals.length > 0;
                return (
                  <div
                    key={dayName}
                    className={`${styles.dayColumnHeader} ${hasHours ? styles.dayColumnHeaderActive : ""}`}
                  >
                    <span className={styles.colDayName}>{weekdayShortNames[idx]}</span>
                    {hasHours ? (
                      <span className={styles.colSlotCount}>
                        {dayIntervals.length} {dayIntervals.length === 1 ? "block" : "blocks"}
                      </span>
                    ) : (
                      <span className={styles.colSlotCountOff}>Off</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Body: 24h Time Axis + 7 Day Columns */}
            <div className={styles.calendarBody}>
              {/* Left Time Axis Gutter */}
              <div className={styles.timeGutter} aria-hidden="true">
                {hoursList.map((hour) => (
                  <div key={hour} className={styles.timeGutterHour}>
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* 7 Day Columns with Visual Blocks */}
              {weekdays.map((dayName, dayIdx) => {
                const dayOfWeek = dayIdx + 1;
                const intervalsWithIndex = value
                  .map((interval, index) => ({ interval, index }))
                  .filter(({ interval }) => interval.dayOfWeek === dayOfWeek);
                const isDayEmpty = intervalsWithIndex.length === 0;

                return (
                  <div
                    key={dayName}
                    className={`${styles.dayColumn} ${isDayEmpty ? styles.dayColumnOff : ""}`}
                  >
                    {/* Background hour grid lines */}
                    {hoursList.slice(0, -1).map((hour) => (
                      <div key={hour} className={styles.hourGridLine}>
                        <div className={styles.halfHourGridLine} />
                      </div>
                    ))}

                    {/* Teal Interval Blocks */}
                    {intervalsWithIndex.map(({ interval, index }) => {
                      const startMin = minutes(interval.startTime);
                      const endMin = minutes(interval.endTime);
                      if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
                        return null;
                      }

                      // Calculate pixel positioning: 48px per hour = 0.8px per minute
                      const topPx = ((startMin - minHour * 60) / 60) * 48;
                      const durationMin = endMin - startMin;
                      const heightPx = Math.max(24, (durationMin / 60) * 48);
                      const isSelected = activeIntervalIndex === index;

                      return (
                        <div
                          key={index}
                          role="button"
                          tabIndex={0}
                          aria-label={`Edit ${dayName} interval ${interval.startTime} to ${interval.endTime}`}
                          className={`${styles.intervalBlock} ${isSelected ? styles.intervalBlockActive : ""}`}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                          }}
                          onClick={() => {
                            setActiveIntervalIndex(index);
                            setQuickEdit({
                              index,
                              dayOfWeek: interval.dayOfWeek,
                              startTime: interval.startTime,
                              endTime: interval.endTime,
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveIntervalIndex(index);
                              setQuickEdit({
                                index,
                                dayOfWeek: interval.dayOfWeek,
                                startTime: interval.startTime,
                                endTime: interval.endTime,
                              });
                            }
                          }}
                        >
                          <div className={styles.blockTime}>
                            <span className={styles.blockTimeStart}>{interval.startTime}</span>
                            <span className={styles.blockTimeSep}>–</span>
                            <span className={styles.blockTimeEnd}>{interval.endTime}</span>
                          </div>
                          <span className={styles.blockDuration}>
                            {formatDuration(durationMin)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Quick Edit Modal (Requirement 5: click calendar block to edit)       */}
      {/* ------------------------------------------------------------------- */}
      {quickEdit !== null && (
        <div
          className={styles.quickEditBackdrop}
          onClick={() => setQuickEdit(null)}
          role="presentation"
        >
          <div
            className={styles.quickEditCard}
            role="dialog"
            aria-modal="true"
            aria-label="Edit working interval"
            onClick={(e) => e.stopPropagation()}
          >
            <h4>Edit Working Interval</h4>
            <p>
              {weekdays[quickEdit.dayOfWeek - 1]} · 24-hour time (HH:mm) · Multiples of 30 minutes
            </p>

            <div className={styles.quickEditTimes}>
              <div className={styles.timeInputWrapper}>
                <label htmlFor="quick-edit-start" className={styles.eyebrow}>
                  Start (HH:mm)
                </label>
                <select
                  id="quick-edit-start"
                  className={styles.timeSelect}
                  value={value[quickEdit.index]?.startTime || quickEdit.startTime}
                  onChange={(e) => updateInterval(quickEdit.index, "startTime", e.target.value)}
                >
                  {getTimeOptions(value[quickEdit.index]?.startTime || quickEdit.startTime).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <span className={styles.timeSeparator}>–</span>
              <div className={styles.timeInputWrapper}>
                <label htmlFor="quick-edit-end" className={styles.eyebrow}>
                  End (HH:mm)
                </label>
                <select
                  id="quick-edit-end"
                  className={styles.timeSelect}
                  value={value[quickEdit.index]?.endTime || quickEdit.endTime}
                  onChange={(e) => updateInterval(quickEdit.index, "endTime", e.target.value)}
                >
                  {getTimeOptions(value[quickEdit.index]?.endTime || quickEdit.endTime).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.quickEditFooter}>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => {
                  removeInterval(quickEdit.index);
                  setQuickEdit(null);
                }}
              >
                Delete interval
              </button>
              <button
                type="button"
                className={styles.doneBtn}
                onClick={() => setQuickEdit(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
