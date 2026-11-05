/** Public catalog view fields shared by V1 previews and V2 Doctor responses. */
export type CatalogDoctor = {
  id: string; name: string; specialty: string; bio: string; district: string;
  address?: string; clinicName?: string; clinicAddress?: string;
};

// Translate catalog copy for the English patient UI without changing API IDs or stored data.
const english: Record<string, string> = {
  "Da liễu": "Dermatology",
  "Tim mạch": "Cardiology",
  "Nội tổng quát": "General Medicine",
  "Khám và tư vấn các vấn đề về da.": "Consultations and care for skin conditions.",
  "Tư vấn và thăm khám các vấn đề tim mạch.": "Consultations and examinations for heart conditions.",
  "Khám sức khỏe tổng quát.": "General health examinations and consultations.",
  "Phòng khám Mẫu A": "Demo Clinic A",
  "Phòng khám Mẫu B": "Demo Clinic B",
  "Thủ Đức": "Thu Duc",
  "Bình Thạnh": "Binh Thanh",
  "Thủ Đức, TP.HCM (địa chỉ minh họa)": "Thu Duc, Ho Chi Minh City (demo address)",
  "Bình Thạnh, TP.HCM (địa chỉ minh họa)": "Binh Thanh, Ho Chi Minh City (demo address)",
  "Thủ Đức, TP.HCM (demo address)": "Thu Duc, Ho Chi Minh City (demo address)",
  "Bình Thạnh, TP.HCM (demo address)": "Binh Thanh, Ho Chi Minh City (demo address)",
};

export function doctorForDisplay<T extends CatalogDoctor>(doctor: T): T {
  const translate = (value: string) => english[value] ?? value;
  return {
    ...doctor,
    name: doctor.name.replace(/^BS\.\s*/, "Dr. "),
    specialty: translate(doctor.specialty),
    bio: translate(doctor.bio),
    ...(typeof doctor.clinicName === "string" ? { clinicName: translate(doctor.clinicName) } : {}),
    ...(typeof doctor.clinicAddress === "string" ? { clinicAddress: translate(doctor.clinicAddress) } : {}),
    ...(typeof doctor.address === "string" ? { address: translate(doctor.address) } : {}),
    district: translate(doctor.district),
  };
}
