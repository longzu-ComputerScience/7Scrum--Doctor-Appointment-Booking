import "server-only";
import { demoDoctors, demoSlots } from "@/lib/demo-data";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import type { AppointmentSlot, Doctor, DoctorSearchFilters } from "@/lib/types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().trim();
const aliases: Record<string, string> = {
  dermatology: "Da liễu", cardiology: "Tim mạch", "general medicine": "Nội tổng quát", general: "Nội tổng quát",
};
function matchDoctor(doctor: Doctor, filters: DoctorSearchFilters) {
  const specialty = filters.specialty ? aliases[filters.specialty.toLowerCase()] || filters.specialty : "";
  const specialtyOK = !specialty || normalize(doctor.specialty).includes(normalize(specialty));
  const districtOK = !filters.district || normalize(doctor.district).includes(normalize(filters.district));
  const keyword = normalize(filters.keyword || "");
  const keywordOK = !keyword || [doctor.name, doctor.specialty, doctor.clinicName, doctor.district].some((value) => normalize(value).includes(keyword));
  return specialtyOK && districtOK && keywordOK;
}

function mapDoctor(row: Record<string, unknown>): Doctor {
  const rawClinic = row.clinics;
  const clinic = (Array.isArray(rawClinic) ? rawClinic[0] : rawClinic) as Record<string, unknown> | undefined;
  return {
    id: String(row.id), name: String(row.name), specialty: String(row.specialty), bio: String(row.bio || ""),
    clinicId: String(row.clinic_id), clinicName: String(clinic?.name || ""),
    clinicAddress: String(clinic?.address || ""), district: String(clinic?.district || ""),
  };
}

export async function searchDoctors(filters: DoctorSearchFilters = {}) {
  if (!isSupabaseConfigured()) return { doctors: demoDoctors.filter((doctor) => matchDoctor(doctor, filters)), demoMode: true };
  const { data, error } = await supabaseAdmin()
    .from("doctors")
    .select("id,name,specialty,bio,clinic_id,clinics!inner(name,address,district,active)")
    .eq("active", true).eq("clinics.active", true).limit(100);
  if (error) throw new Error("Failed to load doctor catalog");
  const doctors = (data || []).map((row) => mapDoctor(row as Record<string, unknown>)).filter((doctor) => matchDoctor(doctor, filters));
  return { doctors, demoMode: false };
}

export async function findDoctor(id: string) {
  const result = await searchDoctors();
  return { doctor: result.doctors.find((doctor) => doctor.id === id) || null, demoMode: result.demoMode };
}

export async function findSlots(doctorId: string) {
  if (!isSupabaseConfigured()) return { slots: demoSlots(doctorId), demoMode: true };
  const { data, error } = await supabaseAdmin().from("appointment_slots")
    .select("id,doctor_id,clinic_id,start_at,end_at,rooms(name),appointments(status)")
    .eq("doctor_id", doctorId).eq("is_published", true)
    .gt("start_at", new Date().toISOString()).order("start_at").limit(100);
  if (error) throw new Error("Failed to load appointment slots");
  const slots: AppointmentSlot[] = (data || []).filter((item) => {
    const bookings = item.appointments as { status: string }[] | null;
    return !(bookings || []).some((booking) => booking.status !== "cancelled");
  }).map((item) => {
    const rawRoom = item.rooms as { name: string } | { name: string }[] | null;
    const room = Array.isArray(rawRoom) ? rawRoom[0] : rawRoom;
    return { id: String(item.id), doctorId: String(item.doctor_id), clinicId: String(item.clinic_id),
      startAt: String(item.start_at), endAt: String(item.end_at), roomName: room?.name || null };
  });
  return { slots, demoMode: false };
}
