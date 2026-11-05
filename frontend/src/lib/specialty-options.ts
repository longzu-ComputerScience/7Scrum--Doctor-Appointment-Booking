import { fe1Request } from "./fe1-api";
import { isRecord } from "./contract-api";
import { parseCatalog } from "./doctor-catalog";
import { doctorForDisplay } from "./doctor-display";

export type SpecialtyOption = { value: string; label: string };

export async function loadSpecialtyOptions(signal?: AbortSignal): Promise<SpecialtyOption[]> {
  let values: string[] = [];
  try {
    const response = await fe1Request("/api/specialties", { signal });
    if (!isRecord(response) || !Array.isArray(response.specialties) ||
        !response.specialties.every(item => typeof item === "string")) throw new Error("Invalid specialties");
    values = response.specialties;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Compatibility with Render before the /api/specialties endpoint is released.
    const catalog = parseCatalog(await fe1Request("/api/doctors", { signal }), true);
    values = catalog.doctors.map(doctor => doctor.specialty);
  }
  const unique = [...new Set(values.map(value => value.normalize("NFC").trim()).filter(Boolean))];
  return unique.map(value => ({
    value,
    label: doctorForDisplay({ id: "", name: "", bio: "", district: "", specialty: value }).specialty,
  })).sort((a,b) => a.label.localeCompare(b.label));
}
