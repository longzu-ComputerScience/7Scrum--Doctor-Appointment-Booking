import { ContractApiError, isRecord, isUuid } from "./contract-api";
import type { CatalogDoctor } from "./doctor-display";

export function parseCatalog(data: unknown): { doctors: CatalogDoctor[]; demoMode: boolean } {
  if (!isRecord(data) || !Array.isArray(data.doctors) || typeof data.demoMode !== "boolean") throw new ContractApiError("invalid");
  const doctors: CatalogDoctor[] = [];
  for (const row of data.doctors) {
    if (!isRecord(row) || !isUuid(row.id) || ["name", "specialty", "bio", "district"].some(key => typeof row[key] !== "string") ||
      !(typeof row.address === "string" || (data.demoMode && typeof row.clinicAddress === "string"))) throw new ContractApiError("invalid");
    if (row.active === false) continue;
    if (row.rating !== undefined && row.rating !== null && (typeof row.rating !== "number" || !Number.isFinite(row.rating) || row.rating < 1 || row.rating > 5)) throw new ContractApiError("invalid");
    if (row.ratingCount !== undefined && (typeof row.ratingCount !== "number" || !Number.isInteger(row.ratingCount) || row.ratingCount < 0)) throw new ContractApiError("invalid");
    if (row.certificates !== undefined && (!Array.isArray(row.certificates) || row.certificates.some(c => !isRecord(c) || typeof c.name !== "string" || typeof c.issuer !== "string" ||
      !(c.issuedYear === null || (Number.isInteger(c.issuedYear) && Number(c.issuedYear) >= 1900)) || !(c.credentialUrl === null || typeof c.credentialUrl === "string")))) throw new ContractApiError("invalid");
    doctors.push(row as CatalogDoctor);
  }
  if (new Set(doctors.map(row => row.id)).size !== doctors.length) throw new ContractApiError("invalid");
  return { doctors, demoMode: data.demoMode };
}
export function catalogPath(specialty: string | null, keyword: string) {
  const params = new URLSearchParams();
  if (specialty?.trim()) params.set("specialty", specialty.trim());
  if (keyword.trim()) params.set("keyword", keyword.normalize("NFC").trim());
  return `/api/doctors${params.size ? `?${params}` : ""}`;
}
