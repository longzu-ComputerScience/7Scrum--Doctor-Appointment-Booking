import { NextResponse } from "next/server";
import { assistantInput } from "@/lib/schemas";
import { searchDoctors } from "@/lib/catalog";
import type { DoctorSearchFilters } from "@/lib/types";

const emergencyPattern = /(đau ngực dữ dội|khó thở nghiêm trọng|bất tỉnh|co giật liên tục|chảy máu không cầm|severe chest pain|difficulty breathing|unconscious)/i;

function simpleFilters(message: string): DoctorSearchFilters {
  const lower = message.toLowerCase();
  const specialty = /da liễu|mụn|nổi mẩn|dermatology/.test(lower) ? "Da liễu"
    : /tim mạch|cardiology/.test(lower) ? "Tim mạch"
    : /nội tổng quát|general medicine/.test(lower) ? "Nội tổng quát" : null;
  const district = /thủ đức|thu duc/.test(lower) ? "Thủ Đức"
    : /bình thạnh|binh thanh/.test(lower) ? "Bình Thạnh" : null;
  return { specialty, district, keyword: specialty || district ? null : message };
}

async function extractWithAI(message: string): Promise<DoctorSearchFilters> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: "You are a clinic booking search router. Extract user preferences and call search_doctors exactly once. Do not diagnose diseases, invent doctors or claim appointment availability. Only use supplied filters. If user describes symptoms, map to a plausible specialty cautiously, without diagnostic claims. Use Vietnamese text where possible. Return null for unspecified filters.",
      input: message,
      tools: [{
        type: "function", name: "search_doctors", description: "Find eligible doctors and clinics based on structured filters",
        strict: true,
        parameters: {
          type: "object", additionalProperties: false,
          properties: {
            specialty: { type: ["string", "null"], description: "Medical specialty (not a diagnosis)" },
            district: { type: ["string", "null"], description: "Preferred geographic district" },
            keyword: { type: ["string", "null"], description: "Doctor or clinic keyword; null if none" },
          },
          required: ["specialty", "district", "keyword"],
        },
      }],
      tool_choice: "required",
      max_output_tokens: 200,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("AI provider unavailable");
  const data = await response.json() as { output?: { type: string; name?: string; arguments?: string }[] };
  const toolCall = data.output?.find((item) => item.type === "function_call" && item.name === "search_doctors");
  if (!toolCall?.arguments) throw new Error("AI returned no search tool call");
  const parsed = JSON.parse(toolCall.arguments) as DoctorSearchFilters;
  return {
    specialty: typeof parsed.specialty === "string" ? parsed.specialty.slice(0, 80) : null,
    district: typeof parsed.district === "string" ? parsed.district.slice(0, 80) : null,
    keyword: typeof parsed.keyword === "string" ? parsed.keyword.slice(0, 100) : null,
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = assistantInput.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Query must contain 2-800 characters" }, { status: 400 });
  const message = parsed.data.message;
  // Guardrail: do not funnel explicitly urgent symptoms into a routine booking recommendation.
  if (emergencyPattern.test(message)) {
    return NextResponse.json({ doctors: [], urgent: true, usedAI: false, demoMode: false,
      message: "Nếu bạn có triệu chứng nghiêm trọng hoặc đang trong tình trạng khẩn cấp, hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất. Hệ thống này không chẩn đoán bệnh." });
  }
  let filters = simpleFilters(message);
  let usedAI = false;
  if (process.env.OPENAI_API_KEY) {
    try { filters = await extractWithAI(message); usedAI = true; } catch { /* Fallback to conservative keyword search */ }
  }
  try {
    const result = await searchDoctors(filters);
    return NextResponse.json({ ...result, filters, usedAI, urgent: false,
      message: result.doctors.length ? "Đây là các bác sĩ trong danh mục phù hợp với bộ lọc tìm kiếm. Vui lòng kiểm tra chuyên khoa trước khi đặt lịch." : "Không có bác sĩ phù hợp trong danh mục hiện tại. Hãy thử chuyên khoa hoặc khu vực khác." });
  } catch {
    return NextResponse.json({ error: "Doctor search is unavailable" }, { status: 503 });
  }
}
