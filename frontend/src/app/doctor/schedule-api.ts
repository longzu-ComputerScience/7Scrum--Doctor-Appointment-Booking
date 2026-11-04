import { ContractApiError, isInstant, isRecord, isUuid, requestJson } from "../../lib/contract-api";
import { hasWeeklyErrors, isCalendarDate, sortIntervals, validateWeeklySchedule, type WeeklyScheduleErrors, type WeeklyScheduleValue, type WorkingInterval } from "./weekly-schedule-utils";

export type ScheduleConflict = { appointmentId: string; startAt: string; endAt: string };
export function parseIntervals(value: unknown, allowEmpty = false): WorkingInterval[] {
  if (!Array.isArray(value) || !value.every(item => isRecord(item) && typeof item.dayOfWeek === "number" &&
      typeof item.startTime === "string" && typeof item.endTime === "string")) throw new ContractApiError("invalid");
  const intervals = value as WorkingInterval[];
  if (!(allowEmpty && intervals.length === 0) && hasWeeklyErrors(validateWeeklySchedule(intervals))) throw new ContractApiError("invalid");
  return sortIntervals(intervals.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })));
}
export function parseSchedule(value: unknown, requireTimezone = false): WeeklyScheduleValue {
  if (!isRecord(value) || typeof value.effectiveDate !== "string" || !isCalendarDate(value.effectiveDate) ||
      (requireTimezone && value.timezone !== "Asia/Ho_Chi_Minh")) throw new ContractApiError("invalid");
  return { effectiveDate: value.effectiveDate, weeklyIntervals: parseIntervals(value.weeklyIntervals, requireTimezone) };
}
export function scheduleValidationErrors(error: unknown): WeeklyScheduleErrors {
  const errors: WeeklyScheduleErrors = { intervals: {} };
  if (!(error instanceof ContractApiError) || error.status !== 422 || !isRecord(error.body) || !Array.isArray(error.body.detail)) return errors;
  for (const detail of error.body.detail) {
    if (!isRecord(detail) || !Array.isArray(detail.loc)) continue;
    if (detail.loc.includes("effectiveDate")) errors.effectiveDate = "Check the future effective date in Vietnam.";
    const field = detail.loc.indexOf("weeklyIntervals");
    const index = field >= 0 ? detail.loc[field + 1] : undefined;
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) errors.intervals[index] = "Check this working interval against the scheduling rules.";
    else if (field >= 0) errors.summary = "Check the weekly working intervals.";
  }
  return errors;
}
export function scheduleConflicts(error: unknown): ScheduleConflict[] {
  if (!(error instanceof ContractApiError) || error.status !== 409 || !isRecord(error.body) || error.body.error !== "SCHEDULE_CONFLICT" || !Array.isArray(error.body.conflicts)) return [];
  return error.body.conflicts.filter((item): item is ScheduleConflict => isRecord(item) && isUuid(item.appointmentId) &&
    isInstant(item.startAt) && isInstant(item.endAt) && Date.parse(item.endAt) > Date.parse(item.startAt));
}
export async function getDoctorSchedule(token: string, signal?: AbortSignal): Promise<WeeklyScheduleValue> {
  if (!token.trim()) throw new ContractApiError(401);
  return parseSchedule(await requestJson("/api/doctor/schedule", { token, signal }), true);
}
export async function putDoctorSchedule(token: string, input: WeeklyScheduleValue, signal?: AbortSignal): Promise<WeeklyScheduleValue> {
  if (!token.trim()) throw new ContractApiError(401);
  if (hasWeeklyErrors(validateWeeklySchedule(input.weeklyIntervals, input.effectiveDate))) throw new ContractApiError(422);
  const body = { effectiveDate: input.effectiveDate, weeklyIntervals: sortIntervals(input.weeklyIntervals) };
  const saved = parseSchedule(await requestJson("/api/doctor/schedule", { method: "PUT", token, body, signal }));
  if (JSON.stringify(saved) !== JSON.stringify(body)) throw new ContractApiError("invalid");
  return saved;
}
