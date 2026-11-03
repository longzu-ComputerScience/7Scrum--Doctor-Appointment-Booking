import type { AppointmentSlot, Doctor } from "@/lib/types";

// Fictional doctors/clinics. Used only if Supabase is not configured.
export const demoDoctors: Doctor[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "BS. Nguyễn Minh An (Demo)",
    specialty: "Da liễu",
    bio: "Khám và tư vấn các vấn đề về da.",
    clinicId: "20000000-0000-4000-8000-000000000001",
    clinicName: "Phòng khám Mẫu A",
    clinicAddress: "Khu vực Thủ Đức, TP.HCM (địa chỉ minh họa)",
    district: "Thủ Đức",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "BS. Trần Hoàng Mai (Demo)",
    specialty: "Tim mạch",
    bio: "Tư vấn và thăm khám các vấn đề tim mạch.",
    clinicId: "20000000-0000-4000-8000-000000000002",
    clinicName: "Phòng khám Mẫu B",
    clinicAddress: "Khu vực Bình Thạnh, TP.HCM (địa chỉ minh họa)",
    district: "Bình Thạnh",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "BS. Lê Quốc Bình (Demo)",
    specialty: "Nội tổng quát",
    bio: "Khám sức khỏe tổng quát.",
    clinicId: "20000000-0000-4000-8000-000000000001",
    clinicName: "Phòng khám Mẫu A",
    clinicAddress: "Khu vực Thủ Đức, TP.HCM (địa chỉ minh họa)",
    district: "Thủ Đức",
  },
];

export function demoSlots(doctorId: string): AppointmentSlot[] {
  const doctor = demoDoctors.find((item) => item.id === doctorId);
  if (!doctor) return [];
  const result: AppointmentSlot[] = [];
  for (let day = 1; day <= 3; day += 1) {
    for (const hour of [9, 10, 14]) {
      const start = new Date();
      start.setDate(start.getDate() + day);
      start.setHours(hour, 0, 0, 0);
      result.push({
        id: "30000000-0000-4000-8000-" + String(day * 100 + hour).padStart(12, "0"),
        doctorId,
        clinicId: doctor.clinicId,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        roomName: null,
      });
    }
  }
  return result;
}
