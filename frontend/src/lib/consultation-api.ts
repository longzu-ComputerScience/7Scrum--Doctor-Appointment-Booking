import { ContractApiError, isRecord, requestJson } from "./contract-api";

export type ConsultationResult = {
  reply: string;
  followUpRequired: boolean;
  specialty: string | null;
  urgent: boolean;
  mode: string;
  usedAI: boolean;
  demoMode: boolean;
};

export function parseConsultation(value: unknown): ConsultationResult {
  if (!isRecord(value) || typeof value.reply !== "string" || !value.reply.trim() ||
    typeof value.followUpRequired !== "boolean" ||
    !(value.specialty === null || (typeof value.specialty === "string" && value.specialty.trim().length > 0 && value.specialty.length <= 80)) ||
    typeof value.urgent !== "boolean" || typeof value.mode !== "string" || !value.mode.trim() ||
    typeof value.usedAI !== "boolean" || typeof value.demoMode !== "boolean" ||
    !Array.isArray(value.doctors)) throw new ContractApiError("invalid");
  return {
    reply: value.reply.trim(), followUpRequired: value.followUpRequired,
    specialty: value.specialty, urgent: value.urgent, mode: value.mode,
    usedAI: value.usedAI, demoMode: value.demoMode,
  };
}

export function responseSource(result: ConsultationResult): string {
  const mode = result.mode.trim().toLowerCase();
  if (mode === "controlled-prototype") return result.usedAI ? "Controlled prototype · AI assisted" : "Controlled prototype";
  if (mode === "fallback") return "Fallback";
  if (mode === "ai") return "AI";
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
