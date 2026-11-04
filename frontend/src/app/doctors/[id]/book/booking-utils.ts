import type { AppointmentSlot, Doctor } from "@/lib/types";
import { doctorForDisplay } from "@/lib/doctor-display";

const timeZone = "Asia/Ho_Chi_Minh";
const keyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const dateKey = (iso: string) => keyFormatter.format(new Date(iso));
export const formatDay = (iso: string) => dayFormatter.format(new Date(iso));
export const formatMonth = (iso: string) => monthFormatter.format(new Date(iso));
export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

export type PatientErrors = { name?: string; phone?: string; notes?: string };

export function validatePatient(name: string, phone: string, notes: string): PatientErrors {
  const errors: PatientErrors = {};
  if (name.trim().length < 2 || name.trim().length > 100) errors.name = "Enter your full name (2–100 characters).";
  if (!/^\+?[0-9 ()-]{9,20}$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 9) errors.phone = "Enter a valid phone number with at least 9 digits (up to 20 characters).";
  if (notes.length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  return errors;
}

export async function loadBookingData(doctorId: string, signal?: AbortSignal) {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  const base = "/api/doctors/" + encodeURIComponent(doctorId);
  const [doctorRes, slotRes] = await Promise.all([
    fetch(base, { signal: requestSignal, cache: "no-store" }),
    fetch(base + "/slots", { signal: requestSignal, cache: "no-store" }),
  ]);
  if (!doctorRes.ok || !slotRes.ok) throw new Error("Booking data unavailable");
  const [doc, available] = await Promise.all([
    doctorRes.json() as Promise<{ doctor: Doctor; demoMode: boolean }>,
    slotRes.json() as Promise<{ slots: AppointmentSlot[]; demoMode: boolean }>,
  ]);
  if (!doc.doctor?.id || doc.doctor.id !== doctorId || !Array.isArray(available.slots) ||
      typeof doc.demoMode !== "boolean" || typeof available.demoMode !== "boolean") throw new Error("Invalid booking data");
  const now = Date.now();
  const slots = available.slots.filter((slot) => slot.doctorId === doctorId &&
    new Date(slot.startAt).getTime() > now && new Date(slot.endAt).getTime() > new Date(slot.startAt).getTime())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return { doctor: doctorForDisplay(doc.doctor), slots, demo: doc.demoMode || available.demoMode };
}
