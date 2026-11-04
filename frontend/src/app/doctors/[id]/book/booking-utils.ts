import { ContractApiError, isInstant, isRecord, isUuid, requestJson } from "../../../../lib/contract-api";
import { vietnamDate } from "../../../../lib/schedule-time";

export type BookingDoctor = { id: string; name: string; specialty: string; bio: string; address: string; district: string };
export type BookingSlot = { id: string; doctorId: string; startAt: string; endAt: string; available: boolean };
export type BookingRange = { from: string; to: string };
export type PatientProfile = { id: string; name: string; phone: string; email: string };
const timeZone = "Asia/Ho_Chi_Minh";
const dayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const dateKey = (iso: string) => vietnamDate(new Date(iso));
export const formatDay = (iso: string) => dayFormatter.format(new Date(iso));
export const formatMonth = (iso: string) => monthFormatter.format(new Date(iso));
export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));
export function bookingRange(now = new Date()): BookingRange {
  const from = vietnamDate(now);
  const end = new Date(`${from}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 27);
  return { from, to: vietnamDate(end) };
}
export const normalizePatientText = (value: string) => value.normalize("NFC").trim();
export type PatientErrors = { name?: string; phone?: string; notes?: string };
export function validatePatient(name: string, phone: string, notes: string): PatientErrors {
  const errors: PatientErrors = {};
  const normalizedName = normalizePatientText(name), normalizedPhone = normalizePatientText(phone);
  if (Array.from(normalizedName).length < 2 || Array.from(normalizedName).length > 100) errors.name = "Enter your full name (2–100 characters).";
  if (!/^\+?[0-9 ()-]{9,20}$/.test(normalizedPhone) || normalizedPhone.replace(/\D/g, "").length < 9) errors.phone = "Enter a valid phone number with at least 9 digits (up to 20 characters).";
  if (Array.from(normalizePatientText(notes)).length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  return errors;
}
export function parseBookingDoctor(value: unknown, doctorId: string): BookingDoctor {
  if (!isRecord(value) || value.id !== doctorId || !isUuid(value.id) ||
      !["name", "specialty", "bio", "address", "district"].every(key => typeof value[key] === "string")) throw new ContractApiError("invalid");
  // No V1 clinic fallback: deployment of the documented Doctor serializer is required.
  return { id: value.id, name: value.name as string, specialty: value.specialty as string, bio: value.bio as string,
    address: value.address as string, district: value.district as string };
}
export function parseBookingSlots(value: unknown, doctorId: string, range: BookingRange, now = Date.now()): BookingSlot[] {
  if (!Array.isArray(value)) throw new ContractApiError("invalid");
  const ids = new Set<string>();
  const result: BookingSlot[] = [];
  for (const slot of value) {
    if (!isRecord(slot) || !isUuid(slot.id) || slot.doctorId !== doctorId || !isInstant(slot.startAt) || !isInstant(slot.endAt) ||
        Date.parse(slot.endAt) - Date.parse(slot.startAt) !== 30 * 60_000 || ids.has(slot.id)) throw new ContractApiError("invalid");
    ids.add(slot.id);
    const day = dateKey(slot.startAt);
    if (Date.parse(slot.startAt) > now && day >= range.from && day <= range.to) result.push({
      id: slot.id, doctorId, startAt: slot.startAt, endAt: slot.endAt, available: true,
    });
  }
  result.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
  for (let i = 1; i < result.length; i++) if (Date.parse(result[i].startAt) < Date.parse(result[i - 1].endAt)) throw new ContractApiError("invalid");
  return result;
}
/** A missing public slot means unavailable; it is not proof of an occupied appointment. */
export function reconcileAvailability(previous: readonly BookingSlot[], fresh: readonly BookingSlot[], range: BookingRange, now = Date.now()): BookingSlot[] {
  const freshIds = new Set(fresh.map(slot => slot.id));
  return [...fresh, ...previous.filter(slot => !freshIds.has(slot.id) && Date.parse(slot.startAt) > now && dateKey(slot.startAt) >= range.from && dateKey(slot.startAt) <= range.to)
    .map(slot => ({ ...slot, available: false }))].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
}
export async function loadBookingData(doctorId: string, signal?: AbortSignal, range = bookingRange()) {
  const base = "/api/doctors/" + encodeURIComponent(doctorId);
  const [doc, availability] = await Promise.all([
    requestJson(base, { signal }), requestJson(`${base}/slots?${new URLSearchParams(range)}`, { signal }),
  ]);
  if (!isRecord(doc) || !isRecord(availability) || typeof doc.demoMode !== "boolean" || typeof availability.demoMode !== "boolean") throw new ContractApiError("invalid");
  return { doctor: parseBookingDoctor(doc.doctor, doctorId), slots: parseBookingSlots(availability.slots, doctorId, range), demo: doc.demoMode || availability.demoMode };
}
export async function loadPatientProfile(token: string, signal?: AbortSignal): Promise<PatientProfile> {
  if (!token.trim()) throw new ContractApiError(401);
  const data = await requestJson("/api/patient/me", { token, signal });
  if (!isRecord(data) || !isRecord(data.patient)) throw new ContractApiError("invalid");
  const patient = data.patient;
  if (!isUuid(patient.id) || !["name", "phone", "email"].every(key => typeof patient[key] === "string")) throw new ContractApiError("invalid");
  const { id, name, phone, email } = patient as PatientProfile;
  return { id, name, phone, email };
}
export function bookingFieldErrors(error: unknown): PatientErrors {
  const fields: PatientErrors = {};
  if (!(error instanceof ContractApiError) || error.status !== 422 || !isRecord(error.body) || !Array.isArray(error.body.detail)) return fields;
  for (const detail of error.body.detail) {
    if (!isRecord(detail) || !Array.isArray(detail.loc)) continue;
    switch (detail.loc.at(-1)) {
      case "patientName": fields.name = "Check your full name (2–100 characters)."; break;
      case "patientPhone": fields.phone = "Check your phone number (9–20 characters)."; break;
      case "notes": fields.notes = "Notes must be 500 characters or fewer."; break;
    }
  }
  return fields;
}
export async function createBooking(token: string, slotId: string, name: string, phone: string, notes: string, signal?: AbortSignal) {
  if (!token.trim()) throw new ContractApiError(401);
  const data = await requestJson("/api/appointments", { method: "POST", token, signal, expected: 201, body: {
    slotId, patientName: normalizePatientText(name), patientPhone: normalizePatientText(phone), notes: normalizePatientText(notes),
  } });
  if (!isRecord(data) || data.status !== "confirmed" || data.demoMode === true || !isUuid(data.appointmentId) ||
      typeof data.bookingReference !== "string" || !data.bookingReference.trim() || data.bookingReference.length > 128) throw new ContractApiError("invalid");
  return { appointmentId: data.appointmentId, reference: data.bookingReference };
}
