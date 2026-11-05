import { ContractApiError, isInstant, isRecord, isUuid } from "./contract-api";
import { fe1Request, type AppointmentStatus } from "./fe1-api";

export type PatientAppointment = {
  id: string;
  doctorId: string;
  bookingReference: string;
  doctorName: string;
  specialty: string;
  address: string;
  district: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
};

export function parsePatientAppointments(value: unknown): PatientAppointment[] {
  if (!isRecord(value) || !Array.isArray(value.appointments)) throw new ContractApiError("invalid");
  const ids = new Set<string>();
  return value.appointments.map((item: unknown) => {
    if (!isRecord(item) || !isUuid(item.id) || !isUuid(item.doctorId) || ids.has(item.id) ||
      typeof item.bookingReference !== "string" || !/^[0-9A-F]{12}$/.test(item.bookingReference) ||
      typeof item.doctorName !== "string" || !item.doctorName.trim() ||
      !["specialty", "address", "district"].every(key => typeof item[key] === "string") ||
      !isInstant(item.startAt) || !isInstant(item.endAt) ||
      Date.parse(item.endAt) <= Date.parse(item.startAt) ||
      !["confirmed", "completed", "cancelled"].includes(String(item.status))) {
      throw new ContractApiError("invalid");
    }
    ids.add(item.id);
    return item as PatientAppointment;
  });
}

export async function loadPatientAppointments(token: string, signal?: AbortSignal): Promise<PatientAppointment[]> {
  if (!token.trim()) throw new ContractApiError(401);
  return parsePatientAppointments(await fe1Request("/api/patient/appointments", { token, signal }));
}
