import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
// Operational log lines for the hosting platform's runtime logs (stdout/stderr).
// Run history stays in Postgres; a line carries IDs that lead to its record.
// Only scalar fields are written, and callers pass codes and IDs, never
// business names, client notes, recipients, model text or credentials.
type Field = string | number | boolean | null | undefined;
type Context = { requestId: string; route: string; method: string };
const context = new AsyncLocalStorage<Context>();
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, Field> = {},
) {
  const line: Record<string, Field> = { level, event };
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined && (value === null || typeof value !== "object"))
      line[key] = value;
  const request = context.getStore();
  if (request) Object.assign(line, request);
  (level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.info)(JSON.stringify(line));
}
// Frames only: an error's message can echo request input such as client notes.
export function stackFrames(error: unknown) {
  return error instanceof Error && error.stack
    ? error.stack
        .split("\n")
        .filter((l) => l.trimStart().startsWith("at "))
        .slice(0, 8)
        .map((l) => l.trim())
        .join(" | ")
    : null;
}
// Wraps a route handler: one line for every non-2xx response, with its safe
// error code, and an x-request-id header that matches the line.
export function withRequestLog(
  route: string,
  handler: (req: Request) => Promise<Response>,
) {
  return (req: Request) => {
    const store = { requestId: randomUUID(), route, method: req.method };
    return context.run(store, async () => {
      const start = Date.now();
      let response: Response;
      try {
        response = await handler(req);
      } catch (error) {
        logEvent("error", "request_crashed", {
          errorName: error instanceof Error ? error.name : typeof error,
          stack: stackFrames(error),
          durationMs: Date.now() - start,
        });
        throw error;
      }
      if (response.status >= 400) {
        let code: string | null = null;
        try {
          const body = await response.clone().json();
          if (typeof body?.error === "string") code = body.error;
        } catch {}
        logEvent(response.status >= 500 ? "error" : "warn", "request_error", {
          status: response.status,
          code,
          durationMs: Date.now() - start,
        });
      }
      try {
        response.headers.set("x-request-id", store.requestId);
      } catch {
        /* Some responses have immutable headers; the log line still has the ID. */
      }
      return response;
    });
  };
}
