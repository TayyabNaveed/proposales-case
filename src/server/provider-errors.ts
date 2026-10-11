import { APICallError } from "ai";
// Safe failure categories for external providers: a short code that says what
// went wrong, never a provider response body. The screen maps each code to what
// the operator can do (components/workbench/api.ts).

// Tavily: 432/433 are plan and pay-as-you-go usage limits (credits used up).
export function searchStatusCode(status: number) {
  if (status === 432 || status === 433) return "search_credits_exhausted";
  if (status === 401 || status === 403) return "search_auth";
  if (status === 429) return "search_rate_limited";
  if (status >= 500) return "search_unavailable";
  return "search_rejected";
}
const timedOut = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
export function searchErrorCode(error: unknown) {
  if (timedOut(error)) return "search_timeout";
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError"))
    return "search_invalid_response";
  return "search_network";
}
// DeepSeek through the AI SDK: 402 means the account balance is empty.
export function aiFailureCode(error: unknown) {
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    if (s === 402) return "ai_balance_empty";
    if (s === 401 || s === 403) return "ai_auth";
    if (s === 429) return "ai_rate_limited";
    if (s >= 500) return "ai_unavailable";
    return "ai_rejected";
  }
  if (timedOut(error)) return "ai_timeout";
  return "ai_network";
}
