// Bounded synthetic example smoke. Existing saved requests are never replaced.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadLocalEnv, safeFailure } from "./env.js";
import { makeSession } from "../src/server/access.js";
const file = "private/refinement-workflow.json";
try {
  loadLocalEnv();
  const origin = process.env.APP_ORIGIN,
    secret = process.env.SESSION_SECRET;
  if (!origin || !secret || new URL(origin).hostname !== "127.0.0.1")
    throw Error("local_probe_configuration");
  const cookie = "case_session=" + makeSession(secret);
  async function request(path: string, body?: unknown) {
    const r = await fetch(origin! + path, {
      headers: {
        cookie,
        origin: origin!,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    if (!r.ok) throw Error("refinement_http_" + r.status);
    return value;
  }
  let saved = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : null;
  const persist = () => {
    fs.mkdirSync("private", { recursive: true });
    fs.writeFileSync(file, JSON.stringify(saved, null, 2) + "\n", {
      mode: 0o600,
    });
  };
  if (!saved) {
    if (!process.argv.includes("--create"))
      throw Error("creation_flag_required");
    saved = { requestId: randomUUID(), preparedAt: new Date().toISOString() };
    persist();
  }
  if (!saved.recommendation) {
    const v = await request("/api/recommendations", {
      reportId: "no-website",
      refresh: false,
    });
    if (v.recommendation.state !== "ready")
      throw Error("recommendation_not_ready");
    saved.recommendation = v.recommendation;
    saved.selections = v.recommendation.selection.items.map(
      ({ serviceId, quantity, disposition }: any) => ({
        serviceId,
        quantity,
        disposition,
      }),
    );
    persist();
  }
  const body = {
    requestId: saved.requestId,
    recommendationId: saved.recommendation.id,
    selections: saved.selections,
  };
  if (!saved.outcome) {
    if (!process.argv.includes("--create"))
      throw Error("creation_flag_required");
    Object.assign(saved, await request("/api/drafts", body));
    persist();
  }
  const repeated = await request("/api/drafts", body);
  if (
    repeated.snapshot.id !== saved.snapshot.id ||
    repeated.outcome.providerId !== saved.outcome.providerId
  )
    throw Error("repeat_identity_mismatch");
  const status = await request("/api/drafts?requestId=" + saved.requestId);
  Object.assign(saved, status, { repeatReused: true });
  persist();
  let historicalState: string | undefined;
  const historical = "private/phase4-workflow.json";
  if (fs.existsSync(historical)) {
    const old = JSON.parse(fs.readFileSync(historical, "utf8"));
    historicalState = (await request("/api/drafts?requestId=" + old.requestId))
      .outcome.state;
  }
  console.log(
    JSON.stringify({
      state: saved.outcome.state,
      compositionVersion: saved.snapshot.snapshot.compositionVersion,
      items: saved.snapshot.snapshot.items.length,
      coreOneTimeMinor: saved.snapshot.snapshot.coreOneTimeMinor,
      coreMonthlyMinor: saved.snapshot.snapshot.coreMonthlyMinor,
      optionalOneTimeMinor: saved.snapshot.snapshot.optionalOneTimeMinor,
      optionalMonthlyMinor: saved.snapshot.snapshot.optionalMonthlyMinor,
      repeatReused: saved.repeatReused,
      historicalState,
      usage: saved.recommendation.usage,
      issues: saved.outcome.issues,
    }),
  );
} catch (error) {
  safeFailure(error);
}
