import { isUuid } from "./contract-api";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();

// Mirrors backend/app/service.py ALIASES; Vietnamese spellings also accept accents omitted.
const aliases: Record<string, string> = {
  dermatology: "Da liễu", "da lieu": "Da liễu",
  cardiology: "Tim mạch", "tim mach": "Tim mạch",
  "general medicine": "Nội tổng quát", general: "Nội tổng quát", "noi tong quat": "Nội tổng quát",
};

export function canonicalSpecialty(value: string | null | undefined): string | null {
  const cleaned = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (!cleaned) return null;
  const key = normalize(cleaned);
  return Object.hasOwn(aliases, key) ? aliases[key] : cleaned;
}

export function specialtyMatches(actual: string, selected: string | null): boolean {
  return !selected || normalize(canonicalSpecialty(actual) ?? "").includes(normalize(canonicalSpecialty(selected) ?? ""));
}

export function readDiscoveryContext(params: Pick<URLSearchParams, "get">) {
  const doctor = params.get("doctor");
  return { specialty: canonicalSpecialty(params.get("specialty")), doctorId: isUuid(doctor) ? doctor : null };
}

export function discoveryHref(specialty: string | null = null, doctorId: string | null = null) {
  const params = new URLSearchParams();
  const selected = canonicalSpecialty(specialty);
  if (selected) params.set("specialty", selected);
  if (isUuid(doctorId)) params.set("doctor", doctorId);
  return `/${params.size ? `?${params}` : ""}#book`;
}

export function doctorBookingHref(doctorId: string, specialty: string | null) {
  if (!isUuid(doctorId)) throw new Error("A catalog doctor UUID is required");
  const context = discoveryHref(specialty, doctorId).split("#")[0].slice(1);
  return `/doctors/${encodeURIComponent(doctorId)}/book${context}`;
}

export type SpecialtyRecommendation = {
  specialty: string | null;
  urgent: boolean;
  followUpRequired: boolean;
};

/** Fail closed: an incomplete consultation or emergency cannot offer routine booking. */
export function recommendationHref(result: SpecialtyRecommendation): string | null {
  if (result.urgent !== false || result.followUpRequired !== false || !canonicalSpecialty(result.specialty)) return null;
  return discoveryHref(result.specialty);
}
