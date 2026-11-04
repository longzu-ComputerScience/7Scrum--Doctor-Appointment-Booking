export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  clinicId: string | null;
  clinicName: string;
  clinicAddress: string;
  district: string;
  address: string;
  certificates: {
    name: string;
    issuer: string;
    issuedYear: number | null;
    credentialUrl: string | null;
  }[];
  rating: number | null;
  ratingCount: number;
};

export type AppointmentSlot = {
  id: string;
  doctorId: string;
  clinicId: string | null;
  startAt: string;
  endAt: string;
  roomName: string | null;
};

export type DoctorSearchFilters = {
  specialty?: string | null;
  district?: string | null;
  keyword?: string | null;
};

export type AppointmentStatus = "requested" | "confirmed" | "checked_in" | "completed" | "cancelled";
