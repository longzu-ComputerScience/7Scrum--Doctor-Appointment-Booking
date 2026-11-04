/** Runtime checks for the current V2 HTTP boundary. Never expose raw error payloads. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export const isInstant = (value: unknown): value is string => typeof value === "string" &&
  /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export class ContractApiError extends Error {
  constructor(public readonly status: number | "network" | "invalid", public readonly body: unknown = null) {
    super(`API request failed (${status})`);
    this.name = "ContractApiError";
  }
  get uncertain() { return this.status === "network" || this.status === "invalid" || (typeof this.status === "number" && this.status >= 500); }
}

export function apiMessage(error: unknown): string {
  const status = error instanceof ContractApiError ? error.status : "network";
  switch (status) {
    case 401: return "Your session has expired. Please sign in again.";
    case 403: return "This account does not have permission for this action.";
    case 404: return "This service or record is not available yet.";
    case 409: return "The schedule or availability has changed. Review the latest information before continuing.";
    case 422: return "Please check the highlighted details and time intervals.";
    case 503: return "The service is temporarily unavailable. Please try again later.";
    case "invalid": return "The service returned an unverified response. No success has been confirmed.";
    default: return "Could not reach the service. Check your connection and refresh.";
  }
}

export async function requestJson(path: string, options: {
  method?: "GET" | "PUT" | "POST"; token?: string; body?: unknown; signal?: AbortSignal; expected?: number;
} = {}): Promise<unknown> {
  const method = options.method ?? "GET";
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await fetch(path, { method, signal, cache: "no-store", headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
  } catch { throw new ContractApiError("network"); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ContractApiError(response.status, body);
  if (response.status !== (options.expected ?? 200) || body === null) throw new ContractApiError("invalid");
  return body;
}
