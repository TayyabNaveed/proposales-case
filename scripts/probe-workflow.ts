import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadLocalEnv, safeFailure } from "./env.js";
import { makeSession } from "../src/server/access.js";
const path = "private/phase4-workflow.json";
try {
  loadLocalEnv();
  const origin = process.env.APP_ORIGIN,
    secret = process.env.SESSION_SECRET;
  if (!origin || !secret || new URL(origin).hostname !== "127.0.0.1")
    throw new Error("local_probe_configuration");
  const probeOrigin: string = origin;
  const cookie = "case_session=" + makeSession(secret);
  async function request(endpoint: string, body?: unknown) {
    const response = await fetch(probeOrigin + endpoint, {
      headers: {
        cookie,
        origin: probeOrigin,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) throw new Error("workflow_http_" + response.status);
    return value;
  }
  const flags = process.argv.slice(2);
  if (flags.some((f) => f !== "--create")) throw new Error("invalid_flags");
  let saved = fs.existsSync(path)
    ? JSON.parse(fs.readFileSync(path, "utf8"))
    : null;
  const write = () => {
    fs.mkdirSync("private", { recursive: true });
    fs.writeFileSync(path, JSON.stringify(saved, null, 2) + "\n", {
      mode: 0o600,
    });
  };
  if (!saved) {
    if (!flags.includes("--create")) throw new Error("creation_flag_required");
    saved = { requestId: randomUUID() };
    write();
    const value = await request("/api/recommendations", {
      reportId: "no-website",
      refresh: false,
    });
    if (
      value.recommendation.state !== "ready" ||
      !value.recommendation.selection?.items.length
    )
      throw new Error("recommendation_not_ready");
    saved = {
      ...saved,
      recommendation: value.recommendation,
      selections: value.recommendation.selection.items.map(
        ({ serviceId, quantity, disposition }: any) => ({
          serviceId,
          quantity,
          disposition,
        }),
      ),
    };
    write();
    const payload = {
      requestId: saved.requestId,
      recommendationId: saved.recommendation.id,
      selections: saved.selections,
    };
    const created = await request("/api/drafts", payload);
    saved = { ...saved, ...created };
    write();
    const repeated = await request("/api/drafts", payload);
    if (
      repeated.snapshot.id !== created.snapshot.id ||
      repeated.outcome.providerId !== created.outcome.providerId
    )
      throw new Error("draft_reuse_failed");
    saved.repeatReused = true;
    write();
  }
  const status = await request(
    "/api/drafts?requestId=" + encodeURIComponent(saved.requestId),
  );
  saved = { ...saved, ...status };
  write();
  console.log(
    JSON.stringify({
      state: saved.outcome.state,
      repeatReused: saved.repeatReused === true,
      items: saved.snapshot.snapshot.items.length,
      coreOneTimeMinor: saved.snapshot.snapshot.coreOneTimeMinor,
      coreMonthlyMinor: saved.snapshot.snapshot.coreMonthlyMinor,
      optionalOneTimeMinor: saved.snapshot.snapshot.optionalOneTimeMinor,
      optionalMonthlyMinor: saved.snapshot.snapshot.optionalMonthlyMinor,
      model: saved.recommendation?.model,
      cacheHit: saved.recommendation?.cacheHit,
      issues: saved.outcome.issues,
    }),
  );
} catch (error) {
  safeFailure(error);
}
