export const explanations: Record<string, string> = {
  // Provider failure categories (server/provider-errors.ts).
  search_credits_exhausted:
    "Web search credits are used up for this billing period. Top up the Tavily plan to research new businesses; saved work and examples still open.",
  search_auth: "Web search isn’t authorised: the Tavily API key is missing or invalid.",
  search_rate_limited: "Web search is busy right now. Wait a minute, then try again.",
  search_unavailable: "Web search is temporarily unavailable. Try again shortly.",
  search_timeout: "Web search took too long. Try again.",
  search_rejected: "Web search refused the request. Check the business name and location.",
  search_invalid_response: "Web search returned an unreadable answer. Try again.",
  search_network: "Web search couldn’t be reached. Check the connection and try again.",
  ai_balance_empty:
    "The AI provider’s balance is empty. Top up DeepSeek to continue; your sources and saved work are kept.",
  ai_auth: "The AI provider isn’t authorised: the DeepSeek API key is missing or invalid.",
  ai_rate_limited: "The AI provider is busy right now. Wait a minute, then try again.",
  ai_unavailable: "The AI provider is temporarily unavailable. Try again shortly.",
  ai_timeout: "The AI took too long to answer. Try again; nothing is lost.",
  ai_rejected: "The AI provider refused the request. Try again; if it persists, check the configured model.",
  ai_network: "The AI provider couldn’t be reached. Check the connection and try again.",
  output_schema: "The AI’s answer didn’t have the expected shape. Try again; nothing is lost.",
  research_unsupported_summary:
    "The AI’s summary made a claim the sources don’t support, so it was not used. Try again.",
  access_required: "Your access has expired. Enter the demo code to continue.",
  origin_rejected: "Open this demo at its configured address to continue.",
  invalid_input: "Check the supplied information and try again.",
  research_configuration_missing:
    "Live research is unavailable. You can explore an example.",
  research_stale:
    "This research has expired. Analyse the business again for current information.",
  research_budget_exceeded:
    "Today’s demo research limit has been reached. It resets at midnight UTC; saved analyses still open, and examples are always available.",
  research_report_failed:
    "The report could not be completed. Your sources are saved; try again.",
  research_search_partial:
    "Some sources could not be retrieved. Try again or explore an example.",
  research_identify_failed:
    "The business could not be identified. Your sources are saved; try again.",
  research_choice_invalid:
    "That choice no longer matches the saved results. Analyse the business again.",
  research_sources_missing:
    "No usable sources were found. Check the business details.",
  stale_recommendation:
    "This recommendation has expired. Update it before creating a proposal.",
  recommendation_call_failed:
    "Service suggestions could not be completed. The report is saved; try again.",
  recommendation_invalid:
    "The suggestions could not be validated. The report is saved; try again.",
  recommendation_budget_exceeded:
    "Today’s demo suggestion limit has been reached. It resets at midnight UTC.",
  draft_budget_exceeded:
    "Today’s demo proposal limit has been reached. It resets at midnight UTC.",
  too_many_attempts: "Please wait a minute before trying again.",
  asset_not_verified: "A selected service is not ready in Proposales.",
  unsupported_adjustment:
    "Keep the recommended services and supported quantities.",
  draft_request_conflict:
    "This proposal request has different selections. Check the existing proposal before starting another version.",
  draft_missing:
    "The proposal request is not saved yet. Retry the saved request to continue.",
  recommendation_interrupted:
    "The suggestions were interrupted. Try again to continue.",
  research_interrupted: "Analysis was interrupted. Try again to continue.",
};
export class WorkbenchError extends Error {
  constructor(readonly code: string) {
    super(
      explanations[code] ??
        "This action could not be completed. Saved work is preserved.",
    );
  }
}
export async function apiRequest<T>(
  path: string,
  body: unknown | undefined,
  onExpired: () => void,
): Promise<T> {
  const r = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = await r.json();
  if (!r.ok) {
    if (r.status === 401) onExpired();
    throw new WorkbenchError(value.error);
  }
  return value as T;
}
export function readSaved(key: string) {
  return localStorage.getItem(key);
}
export function saveRequired(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  if (localStorage.getItem(key) !== JSON.stringify(value))
    throw Error(
      "Proposal recovery could not be saved. Enable browser storage before creating a proposal.",
    );
}
export function friendlyDate(value: string | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toDateString() === new Date().toDateString()
    ? "today"
    : date.toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
