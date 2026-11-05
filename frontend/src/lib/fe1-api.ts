import { ContractApiError, isInstant, isRecord, isUuid } from "./contract-api";

export type Role = "patient" | "doctor";
export type PatientProfile = { id: string; name: string; phone: string; email: string };
export type DoctorProfile = { id: string; name: string; specialty: string; active: boolean };
export type Identity = { role: "patient"; patient: PatientProfile } | { role: "doctor"; doctor: DoctorProfile };
export type AppointmentStatus = "confirmed" | "completed" | "cancelled";
export type DoctorAppointment = {
  id: string; doctorId: string; patientName: string; patientPhone: string;
  startAt: string; endAt: string; status: AppointmentStatus;
};
export type DoctorNotification = {
  id: string; appointmentId: string; patientName: string; startAt: string; endAt: string;
  createdAt: string; readAt: string | null;
};

/** Only a response from the authenticated API establishes a role, never user_metadata. */
export async function fe1Request(path: string, options: {
  token?: string; method?: "GET" | "POST" | "PATCH"; body?: unknown; expected?: number; signal?: AbortSignal;
} = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET", cache: "no-store",
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      headers: { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch { throw new ContractApiError("network"); }
  if (response.status === 401 && options.token && typeof window !== "undefined") {
    // Include the request token so a delayed old response cannot invalidate a newer session.
    window.dispatchEvent(new CustomEvent("carely:unauthorized", { detail: options.token }));
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ContractApiError(response.status, body);
  if (response.status !== (options.expected ?? 200) || body === null) throw new ContractApiError("invalid");
  return body;
}

export function parsePatient(data: unknown): PatientProfile {
  const p = isRecord(data) ? data.patient : null;
  if (!isRecord(p) || !isUuid(p.id) || typeof p.name !== "string" || !p.name.trim() ||
    typeof p.phone !== "string" || typeof p.email !== "string") throw new ContractApiError("invalid");
  return { id: p.id, name: p.name, phone: p.phone, email: p.email };
}
export function parseDoctorProfile(data: unknown): DoctorProfile {
  const d = isRecord(data) ? data.doctor : null;
  if (!isRecord(d) || !isUuid(d.id) || typeof d.name !== "string" || !d.name.trim() ||
    typeof d.specialty !== "string" || typeof d.active !== "boolean") throw new ContractApiError("invalid");
  return { id: d.id, name: d.name, specialty: d.specialty, active: d.active };
}
export async function loadIdentity(token: string, signal?: AbortSignal): Promise<Identity> {
  try { return { role: "patient", patient: parsePatient(await fe1Request("/api/patient/me", { token, signal })) }; }
  catch (error) {
    if (!(error instanceof ContractApiError) || error.status !== 403) throw error;
  }
  return { role: "doctor", doctor: parseDoctorProfile(await fe1Request("/api/doctor/me", { token, signal })) };
}
const validRange = (row: Record<string, unknown>) => isInstant(row.startAt) && isInstant(row.endAt) && Date.parse(row.endAt) > Date.parse(row.startAt);
const status = (value: unknown): value is AppointmentStatus => value === "confirmed" || value === "completed" || value === "cancelled";
function unique(rows: { id: string }[]) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new ContractApiError("invalid");
}
export function parseAppointments(data: unknown, doctorId: string): DoctorAppointment[] {
  if (!isRecord(data) || !Array.isArray(data.appointments)) throw new ContractApiError("invalid");
  const rows = data.appointments.map((row: unknown) => {
    if (!isRecord(row) || !isUuid(row.id) || row.doctorId !== doctorId || !validRange(row) ||
      typeof row.patientName !== "string" || typeof row.patientPhone !== "string" || !status(row.status)) throw new ContractApiError("invalid");
    return row as DoctorAppointment;
  });
  unique(rows); return rows;
}
export function upcomingAppointments(rows: DoctorAppointment[], now = Date.now()) {
  return rows.filter(row => row.status === "confirmed" && Date.parse(row.startAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
}
export function parseNotifications(data: unknown): DoctorNotification[] {
  if (!isRecord(data) || !Array.isArray(data.notifications)) throw new ContractApiError("invalid");
  const rows = data.notifications.map((row: unknown) => {
    if (!isRecord(row) || !isUuid(row.id) || !isUuid(row.appointmentId) || typeof row.patientName !== "string" ||
      !validRange(row) || !isInstant(row.createdAt) || !(row.readAt === null || isInstant(row.readAt))) throw new ContractApiError("invalid");
    return row as DoctorNotification;
  });
  unique(rows); return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
export async function markNotificationRead(id: string, token: string) {
  if (!isUuid(id)) throw new ContractApiError("invalid");
  const data = await fe1Request(`/api/doctor/notifications/${id}`, { token, method: "PATCH", body: { read: true } });
  const row = isRecord(data) ? data.notification : null;
  if (!isRecord(row) || row.id !== id || !isInstant(row.readAt)) throw new ContractApiError("invalid");
  return row.readAt;
}
export async function updateAppointment(id: string, next: "completed" | "cancelled", token: string) {
  if (!isUuid(id)) throw new ContractApiError("invalid");
  const data = await fe1Request(`/api/doctor/appointments/${id}`, { token, method: "PATCH", body: { status: next } });
  const row = isRecord(data) ? data.appointment : null;
  if (!isRecord(row) || row.id !== id || row.status !== next) throw new ContractApiError("invalid");
}

export const normalize = (value: string) => value.normalize("NFC").trim();
export type Registration = { name: string; email: string; phone: string; password: string; confirmation: string;
  address: string; specialty: string; certificateName: string; certificateIssuer: string; certificateNumber: string };
export function registrationErrors(value: Registration, role: Role): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalize(value.email))) errors.email = "Enter a valid email address.";
  if (value.password.length < 8) errors.password = "Use at least 8 characters.";
  if (value.password !== value.confirmation) errors.confirmation = "Passwords do not match.";
  const length = Array.from(normalize(value.name)).length;
  if (length < 2 || length > 100) errors.name = "Enter a name between 2 and 100 characters.";
  const phone = normalize(value.phone);
  if (!/^\+?[0-9 ()-]{9,20}$/.test(phone) || (phone.match(/[0-9]/g)?.length ?? 0) < 9) errors.phone = "Enter a phone number with at least 9 digits.";
  if (role === "doctor") for (const key of ["address", "specialty", "certificateName", "certificateIssuer", "certificateNumber"] as const) {
    const count = Array.from(normalize(value[key])).length;
    if (!count || count > 200) errors[key] = "Enter this detail (up to 200 characters).";
  }
  return errors;
}
export async function registerAccount(role: Role, value: Registration) {
  if (role !== "patient") throw new ContractApiError(503);
  const body = { name: normalize(value.name), email: normalize(value.email), phone: normalize(value.phone), password: value.password };
  const data = await fe1Request("/api/auth/patients/register", { method: "POST", body, expected: 201 });
  if (!isRecord(data) || !isUuid(data.userId)) throw new ContractApiError("invalid");
}
export function registrationMessage(error: unknown) {
  if (error instanceof ContractApiError) {
    if (error.status === 409) return "This account is already registered. Try signing in or contact support.";
    if (error.uncertain) return "Registration could not be verified. It may have been saved. Try signing in or contact support before registering again.";
  }
  return "Registration failed. Check your details and try again.";
}
/** Only internal, role-appropriate destinations survive login. */
export function safeReturnTo(value: string | null, role: Role) {
  const fallback = role === "doctor" ? "/doctor" : "/";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  if (role === "doctor") return /^\/doctor(?:\/appointments\/[\da-f-]{36})?(?:[?#].*)?$/i.test(value) ? value : fallback;
  return /^\/(?:[?#].*)?$/.test(value) || /^\/doctors\/[\da-f-]{36}\/book(?:[?#].*)?$/i.test(value) ? value : fallback;
}
