import { vietnamDate } from "../../lib/schedule-time";

export type WorkingInterval = { dayOfWeek: number; startTime: string; endTime: string };
export type WeeklyScheduleValue = { weeklyIntervals: WorkingInterval[]; effectiveDate: string };
export type WeeklyScheduleErrors = { summary?: string; effectiveDate?: string; intervals: Record<number, string> };
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const minutes = (time: string): number => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return Number.isFinite(parsed.getTime()) && vietnamDate(parsed) === value;
}

export function validateWeeklySchedule(intervals: readonly WorkingInterval[], effectiveDate?: string, now = new Date()): WeeklyScheduleErrors {
  const errors: WeeklyScheduleErrors = { intervals: {} };
  if (!intervals.length) errors.summary = "Select at least one weekday and add a working interval.";
  if (effectiveDate !== undefined && (!isCalendarDate(effectiveDate) || effectiveDate <= vietnamDate(now))) {
    errors.effectiveDate = "Choose an effective date after today in Vietnam.";
  }
  intervals.forEach((interval, index) => {
    const start = minutes(interval.startTime), end = minutes(interval.endTime);
    if (!Number.isInteger(interval.dayOfWeek) || interval.dayOfWeek < 1 || interval.dayOfWeek > 7) {
      errors.intervals[index] = "Choose a weekday from Monday to Sunday.";
    } else if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.intervals[index] = "Enter a valid start and end time.";
    } else if (end <= start) {
      errors.intervals[index] = "End time must be after start time on the same day.";
    } else if (end - start < 30 || (end - start) % 30 !== 0) {
      errors.intervals[index] = "Each interval must last at least 30 minutes, in multiples of 30 minutes.";
    }
  });
  // Compare every valid pair, including nested intervals and unsorted input.
  intervals.forEach((a, i) => intervals.forEach((b, j) => {
    if (j > i && a.dayOfWeek === b.dayOfWeek && minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime)) {
      errors.intervals[i] = errors.intervals[j] = "Working intervals on the same day must not overlap.";
    }
  }));
  return errors;
}
export const hasWeeklyErrors = (errors: WeeklyScheduleErrors) => Boolean(errors.summary || errors.effectiveDate || Object.keys(errors.intervals).length);
export const sortIntervals = (value: readonly WorkingInterval[]) => [...value].sort((a, b) => a.dayOfWeek - b.dayOfWeek || minutes(a.startTime) - minutes(b.startTime));
