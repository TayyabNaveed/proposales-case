import fs from "node:fs";
import { loadLocalEnv, safeFailure } from "./env.js";
import { makeSession } from "../src/server/access.js";
const path = "private/phase5-research.json";
try {
  loadLocalEnv();
  const configuredOrigin = process.env.APP_ORIGIN,
    secret = process.env.SESSION_SECRET;
  if (
    !configuredOrigin ||
    !secret ||
    new URL(configuredOrigin).hostname !== "127.0.0.1"
  )
    throw Error("local_probe_configuration");
  const origin: string = configuredOrigin,
    cookie = "case_session=" + makeSession(secret);
  const run = process.argv.includes("--run");
  if (
    process.argv.slice(2).some((f) => f !== "--run" && f !== "--retry-report")
  )
    throw Error("invalid_flags");
  let saved = fs.existsSync(path)
    ? JSON.parse(fs.readFileSync(path, "utf8"))
    : {
        input: {
          businessName: "Hotel Diplomat",
          location: "Stockholm",
          website: "https://www.diplomathotel.com",
        },
      };
  const write = () => {
    fs.mkdirSync("private", { recursive: true });
    fs.writeFileSync(path, JSON.stringify(saved, null, 2) + "\n", {
      mode: 0o600,
    });
  };
  async function request(endpoint: string, body?: unknown) {
    const r = await fetch(origin + endpoint, {
      headers: {
        cookie,
        origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const v = await r.json();
    if (!r.ok) throw Error("research_http_" + r.status);
    return v;
  }
  if (!saved.search) {
    if (!run) throw Error("run_flag_required");
    saved.search = (
      await request("/api/research", { input: saved.input, refresh: false })
    ).record;
    write();
  } else {
    saved.search = (
      await request("/api/research?id=" + saved.search.id)
    ).record;
    write();
  }
  if (saved.search.state !== "ready") {
    console.log(
      JSON.stringify({
        stage: "search",
        state: saved.search.state,
        errorCode: saved.search.errorCode,
      }),
    );
    process.exitCode = 1;
  } else {
    if (!saved.report) {
      if (!run) throw Error("run_flag_required");
      saved.report = (
        await request("/api/reports", {
          searchId: saved.search.id,
          refresh: false,
        })
      ).record;
      write();
    } else if (
      saved.report.state === "failed" &&
      process.argv.includes("--retry-report")
    ) {
      saved.failedReports = [...(saved.failedReports ?? []), saved.report];
      saved.report = (
        await request("/api/reports", {
          searchId: saved.search.id,
          refresh: true,
        })
      ).record;
      write();
    } else {
      saved.report = (
        await request("/api/reports?id=" + saved.report.id)
      ).record;
      write();
    }
    if (saved.report.state !== "ready") {
      console.log(
        JSON.stringify({
          stage: "report",
          state: saved.report.state,
          errorCode: saved.report.errorCode,
        }),
      );
      process.exitCode = 1;
    } else {
      if (!saved.recommendation) {
        if (!run) throw Error("run_flag_required");
        saved.recommendation = (
          await request("/api/recommendations", {
            reportId: saved.report.result.report.id,
            refresh: false,
          })
        ).recommendation;
        write();
      } else {
        saved.recommendation = (
          await request("/api/recommendations?id=" + saved.recommendation.id)
        ).recommendation;
        write();
      }
      console.log(
        JSON.stringify({
          searchState: saved.search.state,
          queries: saved.search.result.queries,
          attempts: saved.search.result.attempts,
          credits: saved.search.result.credits,
          searchMs: saved.search.result.durationMs,
          sources: saved.search.result.evidence.length,
          reportState: saved.report.state,
          identity: saved.report.result.report.identityStatus,
          findings: saved.report.result.report.findings.length,
          reportMs: saved.report.result.durationMs,
          reportUsage: saved.report.result.usage,
          recommendationState: saved.recommendation.state,
          selected: saved.recommendation.selection?.items.map(
            ({ serviceId, quantity, disposition }: any) => ({
              serviceId,
              quantity,
              disposition,
            }),
          ),
          recommendationUsage: saved.recommendation.usage,
        }),
      );
    }
  }
} catch (e) {
  safeFailure(e);
}
