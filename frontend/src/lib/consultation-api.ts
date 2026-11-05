import { ContractApiError, isRecord, isUuid, requestJson } from "./contract-api";
import { specialtyMatches } from "./specialty-handoff";

/** Only backend catalog records with a verifiable UUID can lead to the booking flow. */
export type ConsultationDoctor = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  district: string;
  address: string;
};

export type ConsultationResult = {
  reply: string;
  followUpRequired: boolean;
  specialty: string | null;
  urgent: boolean;
  mode: string;
  usedAI: boolean;
  demoMode: boolean;
  doctors: ConsultationDoctor[];
};

export function parseConsultation(value: unknown): ConsultationResult {
  if (!isRecord(value) || typeof value.reply !== "string" || !value.reply.trim() ||
    typeof value.followUpRequired !== "boolean" ||
    !(value.specialty === null || (typeof value.specialty === "string" && value.specialty.trim().length > 0 && value.specialty.length <= 80)) ||
    typeof value.urgent !== "boolean" || typeof value.mode !== "string" || !value.mode.trim() ||
    typeof value.usedAI !== "boolean" || typeof value.demoMode !== "boolean" ||
    !Array.isArray(value.doctors) || value.doctors.length > 100) throw new ContractApiError("invalid");
  const doctors = value.doctors.map((entry): ConsultationDoctor => {
    if (!isRecord(entry) || !isUuid(entry.id) ||
      ["name", "specialty", "bio", "district", "address"].some(
        key => typeof entry[key] !== "string") ||
      !(entry.name as string).trim() || !(entry.specialty as string).trim()) {
      throw new ContractApiError("invalid");
    }
    return {
      id: entry.id as string,
      name: entry.name as string,
      specialty: entry.specialty as string,
      bio: entry.bio as string,
      district: entry.district as string,
      address: entry.address as string,
    };
  });
  // Incomplete/urgent responses must not expose clickable doctor recommendations.
  if ((value.urgent || value.followUpRequired || value.specialty === null) && doctors.length) {
    throw new ContractApiError("invalid");
  }
  return {
    reply: value.reply.trim(), followUpRequired: value.followUpRequired,
    specialty: value.specialty, urgent: value.urgent, mode: value.mode,
    usedAI: value.usedAI, demoMode: value.demoMode, doctors,
  };
}

/** Older Render builds return a specialty but omit the doctor cards in demo mode.
 * Resolve missing cards only from the public, backend-validated catalog. No
 * synthetic identities are generated in the browser and no booking is created.
 */
export async function withCatalogSuggestions(result: ConsultationResult, signal?: AbortSignal): Promise<ConsultationResult> {
  if (result.urgent || result.followUpRequired || !result.specialty || result.doctors.length > 0) return result;
  try {
    const query = new URLSearchParams({ specialty: result.specialty });
    const body = await requestJson("/api/doctors?" + query, { signal });
    if (!isRecord(body) || typeof body.demoMode !== "boolean" || !Array.isArray(body.doctors)) return result;
    const candidates = body.doctors.filter(row =>
      isRecord(row) && typeof row.specialty === "string" &&
      specialtyMatches(row.specialty, result.specialty)
    ).slice(0, 5);
    if (!candidates.length) return result;
    return parseConsultation({ ...result, doctors: candidates, demoMode: body.demoMode });
  } catch {
    // Catalog may be offline; preserve the verified consultation result.
    return result;
  }
}

export function responseSource(result: ConsultationResult): string {
  const mode = result.mode.trim().toLowerCase();
  if (mode === "controlled-prototype") return result.usedAI ? "Controlled prototype · AI assisted" : "Controlled prototype";
  if (mode === "fallback") return "Fallback";
  if (mode === "ai") return "AI";
  if (!result.usedAI && (mode === "rule-based" || mode === "follow-up")) return "Scripted fallback · no AI";
  return result.mode;
}

/** The light is green only after the latest successful consultation used a real AI result. */
export type AiApiStatus = "unchecked" | "checking" | "connected" | "fallback" | "error";

export function aiApiStatus(result: ConsultationResult | null, busy: boolean, hasError: boolean): AiApiStatus {
  if (busy) return "checking";
  if (hasError) return "error";
  if (result === null) return "unchecked";
  // Emergency guidance is always local: never treat it as proof of a provider connection.
  return result.usedAI && !result.urgent ? "connected" : "fallback";
}

export async function postConsultation(messages: string[], signal?: AbortSignal): Promise<ConsultationResult> {
  if (!messages.length || messages.length > 4 || messages.some(message => message.trim().length < 2 || message.length > 800))
    throw new ContractApiError(422);
  return parseConsultation(await requestJson("/api/consult", { method: "POST", body: { messages }, signal }));
}


/** Short, deterministic example answers for the scripted (non-AI) follow-ups. */
export function scriptedReplyOptions(question: string): string[] {
  const normalized = question.toLocaleLowerCase("vi");
  if (normalized.includes("bắt đầu từ khi nào") || normalized.includes("bao lâu")) {
    return ["Hôm nay", "Khoảng 2 ngày", "Hơn một tuần"];
  }
  if (normalized.includes("chuyên khoa nào") || normalized.includes("khám tổng quát")) {
    return ["Khám tổng quát", "Da liễu", "Tim mạch"];
  }
  if (normalized.includes("bộ phận nào") || normalized.includes("vị trí nào")) {
    return ["Nổi mẩn ở da", "Nhức đầu", "Mệt mỏi toàn thân"];
  }
  return ["Hôm nay", "Khoảng 2 ngày", "Khám tổng quát"];
}
