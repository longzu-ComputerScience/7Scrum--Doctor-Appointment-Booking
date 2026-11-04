/** Shared Vietnam display/date helpers; no Staff or API dependency. */
export const SCHEDULE_TIMEZONE = "Asia/Ho_Chi_Minh";
const dayFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SCHEDULE_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SCHEDULE_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export const formatScheduleDay = (value: string) => dayFormatter.format(new Date(value));
export const formatScheduleTime = (value: string) => timeFormatter.format(new Date(value));
export function vietnamDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
