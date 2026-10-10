export const explanations: Record<string, string> = {
  access_required: "Your access has expired. Enter the demo code to continue.",
  origin_rejected: "Open this demo at its configured address to continue.",
  invalid_input: "Check the supplied information and try again.",
  research_configuration_missing:
    "Live research is unavailable. You can explore an example.",
  research_stale:
    "This research has expired. Analyse the business again for current information.",
  research_budget_exceeded:
    "Today’s research limit has been reached. Try tomorrow or explore an example.",
  research_report_failed:
    "The report could not be completed. Your sources are saved; try again.",
  research_search_partial:
    "Some sources could not be retrieved. Try again or explore an example.",
  research_sources_missing:
    "No usable sources were found. Check the business details.",
  stale_recommendation:
    "This recommendation has expired. Update it before creating a proposal.",
  recommendation_call_failed:
    "Service suggestions could not be completed. The report is saved; try again.",
  recommendation_invalid:
    "The suggestions could not be validated. The report is saved; try again.",
  recommendation_budget_exceeded:
    "Today’s suggestion limit has been reached. Try tomorrow.",
  draft_budget_exceeded:
    "Today’s proposal limit has been reached. Try tomorrow.",
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
