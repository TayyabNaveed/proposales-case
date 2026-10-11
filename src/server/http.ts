import { checkOrigin, readSession } from "./access.js";
import { logEvent, stackFrames } from "./log.js";
export function sameOrigin(req: Request, env: NodeJS.ProcessEnv = process.env) {
  if (!env.APP_ORIGIN) throw new Error("access_unconfigured");
  if (!checkOrigin(req.headers.get("origin"), env.APP_ORIGIN))
    throw new Error("origin_rejected");
}
export function account(
  req: Request,
  mutation = true,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (mutation) sameOrigin(req, env);
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("access_unconfigured");
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("case_session="))
    ?.slice("case_session=".length);
  const who = readSession(token, secret);
  if (!who) throw new Error("access_required");
  return who;
}
export async function reviewer(req: Request) {
  return account(req);
}
export async function smallJson(req: Request) {
  if (Number(req.headers.get("content-length")) > 8192)
    throw new Error("invalid_input");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_input");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8192) {
        await reader.cancel();
        throw new Error("invalid_input");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_input");
  }
}
export function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "",
    code =
      error instanceof Error && error.name === "ZodError"
        ? "invalid_input"
        : raw;
  const forbidden = ["origin_rejected"],
    unauthorised = ["access_required", "reviewer_required"],
    missing = [
      "draft_missing",
      "recommendation_missing",
      "report_missing",
      "research_missing",
    ],
    conflicts = [
      "stale_recommendation",
      "draft_request_conflict",
      "unsupported_adjustment",
      "payload_conflict",
      "asset_not_verified",
      "snapshot_tampered",
      "research_stale",
      "research_choice_invalid",
    ],
    limits = [
      "recommendation_budget_exceeded",
      "draft_budget_exceeded",
      "too_many_attempts",
      "research_budget_exceeded",
    ];
  const allowed = [
    ...forbidden,
    ...unauthorised,
    ...missing,
    ...conflicts,
    ...limits,
    "access_unconfigured",
    "provider_configuration_missing",
    "model_configuration_missing",
    "invalid_input",
    "empty_offer",
    "unsupported_service",
    "missing_prerequisite",
    "overlap_website_scope",
    "recommendation_invalid",
    "recommendation_call_failed",
    "recommendation_cancelled",
    "research_configuration_missing",
    "research_sources_missing",
    "research_search_partial",
    "research_report_failed",
    "research_identify_failed",
    "research_intro_failed",
    "research_search_failed",
  ];

  const safe = allowed.includes(code) ? code : "request_failed";
  // An unrecognised error is a defect or an outage, not a bad request: log it.
  if (safe === "request_failed")
    logEvent("error", "unexpected_error", {
      errorName: error instanceof Error ? error.name : typeof error,
      stack: stackFrames(error),
    });
  return Response.json(
    { error: safe },
    {
      status: forbidden.includes(code)
        ? 403
        : unauthorised.includes(code)
          ? 401
          : missing.includes(code)
            ? 404
            : conflicts.includes(code)
              ? 409
              : limits.includes(code)
                ? 429
                : [
                      "access_unconfigured",
                      "provider_configuration_missing",
                      "model_configuration_missing",
                      "research_configuration_missing",
                    ].includes(code)
                  ? 503
                  : safe === "request_failed"
                    ? 500
                    : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
