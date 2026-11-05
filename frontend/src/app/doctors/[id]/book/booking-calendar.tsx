"use client";

import { useState } from "react";
import { dateKey, formatDay, formatMonth, type BookingRange, type BookingSlot } from "./booking-utils";
import { BookingIcon } from "./booking-dialog";
import styles from "./booking.module.css";

type Props = { slots: BookingSlot[]; range: BookingRange; selectedDate: string; onSelect: (date: string) => void; disabled: boolean };
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function BookingCalendar({ slots, range, selectedDate, onSelect, disabled }: Props) {
  const today = dateKey(new Date().toISOString());
  const [month, setMonth] = useState(() => (selectedDate || today).slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const monthLabel = formatMonth(month + "-01T00:00:00+07:00");
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates = new Set(slots.filter(slot => slot.available).map((slot) => dateKey(slot.startAt)));
  const lastMonth = range.to.slice(0, 7);

  function moveMonth(amount: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return <div className={styles.calendar}>
    <div className={styles.monthHeading}>
      <button type="button" className={styles.iconButton} aria-label="Previous month" disabled={disabled || month <= today.slice(0, 7)} onClick={() => moveMonth(-1)}><BookingIcon name="left" /></button>
      <h3 aria-live="polite">{monthLabel}</h3>
      <button type="button" className={styles.iconButton} aria-label="Next month" disabled={disabled || month >= lastMonth} onClick={() => moveMonth(1)}><BookingIcon name="right" /></button>
    </div>
    <div className={styles.calendarGrid} role="group" aria-label={`Choose an appointment date, ${monthLabel}`}>
      {weekdays.map((day) => <span key={day} className={styles.weekday} aria-hidden="true">{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const key = `${month}-${String(day).padStart(2, "0")}`;
        const available = dates.has(key) && key >= today && key >= range.from && key <= range.to;
        return <button type="button" key={key} className={`${styles.day} ${key === selectedDate ? styles.selectedDay : ""}`} disabled={disabled || !available}
          aria-pressed={key === selectedDate} aria-current={key === today ? "date" : undefined}
          aria-label={`${formatDay(key + "T00:00:00+07:00")}${available ? ", available" : ", unavailable"}`}
          onClick={() => onSelect(key)}>{day}{available && <span className={styles.availabilityDot} aria-hidden="true" />}</button>;
      })}
    </div>
    <div className={styles.legend}><span><i className={styles.availabilityDot} />Available</span><span><i className={styles.legendSelected} />Selected</span><span><i className={styles.legendUnavailable} />Unavailable</span></div>
  </div>;
}
