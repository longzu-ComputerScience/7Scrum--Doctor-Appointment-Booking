import { vietnamDate } from "../../lib/schedule-time";

export type WorkingInterval = { dayOfWeek: number; startTime: string; endTime: string };
export type WeeklyScheduleValue = { weeklyIntervals: WorkingInterval[]; effectiveDate: string };
export type WeeklyScheduleErrors = { summary?: string; effectiveDate?: string; intervals: Record<number, string> };
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayShortNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 30-minute time intervals across 24 hours (00:00 to 23:30) */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

/** Returns 30-min options, including the currentValue if it does not match a standard slot */
export function getTimeOptions(currentValue?: string): string[] {
  if (currentValue && !TIME_OPTIONS.includes(currentValue)) {
    return [currentValue, ...TIME_OPTIONS].sort();
  }
  return TIME_OPTIONS;
}

export const minutes = (time: string): number =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    : NaN;

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return Number.isFinite(parsed.getTime()) && vietnamDate(parsed) === value;
}

export function validateWeeklySchedule(
  intervals: readonly WorkingInterval[],
  effectiveDate?: string,
  now = new Date()
): WeeklyScheduleErrors {
  const errors: WeeklyScheduleErrors = { intervals: {} };
  if (!intervals.length) errors.summary = "Select at least one weekday and add a working interval.";
  if (effectiveDate !== undefined && (!isCalendarDate(effectiveDate) || effectiveDate <= vietnamDate(now))) {
    errors.effectiveDate = "Choose an effective date after today in Vietnam.";
  }
  intervals.forEach((interval, index) => {
    const start = minutes(interval.startTime),
      end = minutes(interval.endTime);
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
  intervals.forEach((a, i) =>
    intervals.forEach((b, j) => {
      if (
        j > i &&
        a.dayOfWeek === b.dayOfWeek &&
        minutes(a.startTime) < minutes(b.endTime) &&
        minutes(b.startTime) < minutes(a.endTime)
      ) {
        errors.intervals[i] = errors.intervals[j] = "Working intervals on the same day must not overlap.";
      }
    })
  );
  return errors;
}

export const hasWeeklyErrors = (errors: WeeklyScheduleErrors) =>
  Boolean(errors.summary || errors.effectiveDate || Object.keys(errors.intervals).length);

export const sortIntervals = (value: readonly WorkingInterval[]) =>
  [...value].sort((a, b) => a.dayOfWeek - b.dayOfWeek || minutes(a.startTime) - minutes(b.startTime));

/** Copies all intervals from sourceDay to each specified targetDay */
export function copyDayIntervals(
  intervals: readonly WorkingInterval[],
  sourceDay: number,
  targetDays: number[]
): WorkingInterval[] {
  const sourceIntervals = intervals.filter((item) => item.dayOfWeek === sourceDay);
  if (!sourceIntervals.length || !targetDays.length) return [...intervals];

  const targetSet = new Set(targetDays);
  const retained = intervals.filter((item) => !targetSet.has(item.dayOfWeek));

  const cloned: WorkingInterval[] = [];
  for (const day of targetDays) {
    for (const item of sourceIntervals) {
      cloned.push({
        dayOfWeek: day,
        startTime: item.startTime,
        endTime: item.endTime,
      });
    }
  }

  return sortIntervals([...retained, ...cloned]);
}

/** Computes total scheduled hours and count of working days */
export function calculateWeeklyStats(intervals: readonly WorkingInterval[]): {
  totalMinutes: number;
  totalHours: number;
  activeDaysCount: number;
} {
  const activeDays = new Set<number>();
  let totalMinutes = 0;

  for (const interval of intervals) {
    const start = minutes(interval.startTime);
    const end = minutes(interval.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      totalMinutes += end - start;
      activeDays.add(interval.dayOfWeek);
    }
  }

  return {
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    activeDaysCount: activeDays.size,
  };
}

export function formatDuration(durationMinutes: number): string {
  if (durationMinutes <= 0) return "0m";
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}
