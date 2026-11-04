import { ContractApiError, isInstant, isRecord, isUuid, requestJson } from "../../lib/contract-api";

export type DoctorProfile = {
  id: string;
  name: string;
  specialty?: string;
  bio?: string;
  address?: string;
  district?: string;
  rating?: number | null;
  ratingCount?: number;
};

export type DoctorAppointment = {
  id: string;
  slotId: string;
  patientName: string;
  patientPhone: string;
  startAt: string;
  status: string;
};

export async function getDoctorProfile(token: string, signal?: AbortSignal): Promise<DoctorProfile> {
  if (!token.trim()) throw new ContractApiError(401);
  const data = await requestJson("/api/doctor/me", { token, signal });
  if (!isRecord(data) || !isRecord(data.doctor) || !isUuid(data.doctor.id) || typeof data.doctor.name !== "string") {
    throw new ContractApiError("invalid");
  }
  const d = data.doctor;
  return {
    id: typeof d.id === "string" ? d.id : "",
    name: typeof d.name === "string" ? d.name : "",
    specialty: typeof d.specialty === "string" ? d.specialty : undefined,
    bio: typeof d.bio === "string" ? d.bio : undefined,
    address: typeof d.address === "string" ? d.address : undefined,
    district: typeof d.district === "string" ? d.district : undefined,
    rating: typeof d.rating === "number" ? d.rating : null,
    ratingCount: typeof d.ratingCount === "number" ? d.ratingCount : undefined,
  };
}

export async function listDoctorAppointments(token: string, signal?: AbortSignal): Promise<DoctorAppointment[]> {
  if (!token.trim()) throw new ContractApiError(401);
  const data = await requestJson("/api/doctor/appointments", { token, signal });
  if (!isRecord(data) || !Array.isArray(data.appointments)) {
    throw new ContractApiError("invalid");
  }
  return data.appointments.map((item) => {
    if (!isRecord(item) || !isUuid(item.id) || !isUuid(item.slotId) ||
        typeof item.patientName !== "string" || !isInstant(item.startAt) ||
        !["confirmed", "completed", "cancelled"].includes(String(item.status))) {
      throw new ContractApiError("invalid");
    }
    return {
      id: item.id,
      slotId: item.slotId,
      patientName: item.patientName,
      patientPhone: typeof item.patientPhone === "string" ? item.patientPhone : "",
      startAt: item.startAt,
      status: item.status as string,
    };
  });
}

export function upcomingAppointments(appointments: DoctorAppointment[], now = Date.now()): DoctorAppointment[] {
  return appointments.filter(item => item.status === "confirmed" && Date.parse(item.startAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}
