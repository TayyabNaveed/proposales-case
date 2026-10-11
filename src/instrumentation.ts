import type { Instrumentation } from "next";
// Errors the route handlers do not catch themselves (page rendering, for
// instance) reach this hook. Only the path, never the query, is logged, and
// the error's type and stack frames, never its message.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent, stackFrames } = await import("./server/log");
  logEvent("error", "unhandled_request_error", {
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    errorName: error instanceof Error ? error.name : typeof error,
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String(error.digest)
        : null,
    stack: stackFrames(error),
  });
};
