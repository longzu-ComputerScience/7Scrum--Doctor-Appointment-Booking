import { statusLabels, type StaffAppointment } from "./appointment-data";

export class StaffApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const messages: Record<number, string> = {
  401: "Your session has expired or is invalid. Please sign in again.",
  403: "You do not have permission to view or update these appointments. Contact your administrator for a doctor assignment.",
  404: "This appointment no longer exists. Refresh the list.",
  409: "This booking has changed. Refreshing appointments; review the latest status before continuing.",
  422: "The request could not be validated. Refresh the list and try again.",
  503: "The appointment service is temporarily unavailable. Please try again later.",
};

async function readResponse(response: Response): Promise<unknown> {
  // Branch on HTTP status first: a proxy may return HTML even for 401/403.
  // Never render raw server errors, validation input, or patient payloads.
  if (!response.ok) throw new StaffApiError(response.status, messages[response.status] || "Unable to load the appointment service. Please try again.");
  try { return await response.json(); }
  catch { throw new StaffApiError(502, "The appointment service returned an unreadable response. Please try again."); }
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ["id", "slotId", "doctorId", "doctorName", "patientName", "patientPhone", "startAt", "status"] as const;
function invalidResponse(): never { throw new StaffApiError(502, "Appointment data does not match API V2. Please contact your administrator."); }

export function parseAppointments(value: unknown): StaffAppointment[] {
  if (!record(value) || !Array.isArray(value.appointments) || value.appointments.length > 100) return invalidResponse();
  return value.appointments.map(row => {
    if (!record(row) || Object.keys(row).length !== fields.length || fields.some(key => typeof row[key] !== "string")) return invalidResponse();
    if (![row.id, row.slotId, row.doctorId].every(id => uuid.test(id as string)) || !Object.hasOwn(statusLabels, row.status as string)
      || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(row.startAt as string) || !Number.isFinite(Date.parse(row.startAt as string))) return invalidResponse();
    return Object.fromEntries(fields.map(key => [key, row[key]])) as StaffAppointment;
  });
}

export async function loadStaffAppointments(token: string, signal?: AbortSignal): Promise<StaffAppointment[]> {
  if (!token) throw new StaffApiError(401, messages[401]);
  const response = await fetch("/api/staff/appointments", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  return parseAppointments(await readResponse(response));
}

export async function confirmStaffAppointment(appointment: StaffAppointment, token: string): Promise<void> {
  if (!token) throw new StaffApiError(401, messages[401]);
  if (appointment.status !== "requested") throw new StaffApiError(409, messages[409]);
  const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }),
  });
  const data = await readResponse(response);
  if (!record(data) || !record(data.appointment) || data.appointment.id !== appointment.id || data.appointment.status !== "confirmed") invalidResponse();
}
