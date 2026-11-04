import type { AppointmentStatus } from "@/lib/types";

export type StaffAppointment = { id: string; slotId: string; doctorId: string; doctorName: string; patientName: string; patientPhone: string; startAt: string; status: AppointmentStatus };
export type Appointment = StaffAppointment;
export const statusLabels: Record<AppointmentStatus, string> = { requested: "Pending confirmation", confirmed: "Confirmed", checked_in: "Checked in", completed: "Completed", cancelled: "Cancelled" };
export function clinicDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
export function displayTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join("").toUpperCase(); }

// Fictional records are only used in the explicitly labelled preview workspace.
export const sampleAppointments: Appointment[] = [
  ["Nguyen Minh Anh", "090 000 0101", "Dr. Sarah Johnson", "09:00", "requested"],
  ["Tran Hoang Nam", "090 000 0102", "Dr. Michael Chen", "09:30", "requested"],
  ["Le Thu Ha", "090 000 0103", "Dr. Emily Wilson", "10:00", "confirmed"],
  ["Pham Quoc Bao", "090 000 0104", "Dr. Sarah Johnson", "10:30", "checked_in"],
  ["Vo Ngoc Linh", "090 000 0105", "Dr. Michael Chen", "11:00", "requested"],
  ["Dang Gia Huy", "090 000 0106", "Dr. Emily Wilson", "13:30", "completed"],
  ["Bui Thao My", "090 000 0107", "Dr. Sarah Johnson", "14:00", "confirmed"],
  ["Do Tuan Kiet", "090 000 0108", "Dr. Michael Chen", "14:30", "cancelled"],
].map(([patientName, patientPhone, doctorName, time, status], index) => ({ id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`, slotId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`, doctorId: `11111111-1111-4111-8111-${String(["Dr. Sarah Johnson", "Dr. Michael Chen", "Dr. Emily Wilson"].indexOf(doctorName) + 1).padStart(12, "0")}`, patientName, patientPhone, doctorName, startAt: `2026-11-04T${time}:00+07:00`, status: status as AppointmentStatus }));
