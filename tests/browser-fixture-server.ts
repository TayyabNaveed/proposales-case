// Local browser QA only: synthetic API responses, no credentials or provider calls.
// Proxies page/assets from the built app on3001. Bind only loopback3002.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { reports, type ReportV2 } from "../src/domain/reports.js";
import { recordedFor } from "../src/domain/workbench.js";
const searches = new Map<string, any>(),
  reportRuns = new Map<string, any>(),
  recommendations = new Map<string, any>(),
  drafts = new Map<string, any>();
const counts = { search: 0, report: 0, selection: 0, create: 0, status: 0 };
let authenticated = false;
const reportFailures = new Set<string>(),
  selectionFailures = new Set<string>();
const fresh = () => new Date(Date.now() + 86400000).toISOString();
const now = () => new Date().toISOString();
const liveReport = (name: string, id: string): ReportV2 => ({
  ...structuredClone(reports[1]),
  id: "live-" + id,
  mode: "live",
  businessName: name,
  goals: [],
  summary:
    "Synthetic browser test: a ceramics studio wants a clearer enquiry journey.",
  evidence: reports[1].evidence.map((e) => ({
    ...e,
    synthetic: false,
    url: "https://juniper.example/",
    retrievedAt: now(),
  })),
});
function makeSearch(name: string): any {
  const id = randomUUID(),
    input = {
      businessName: name,
      location: "Stockholm",
      website: "https://juniper.example/",
    };
  const record = {
    id,
    stage: "search",
    state: "ready",
    input,
    errorCode: null,
    createdAt: now(),
    expiresAt: fresh(),
    cacheHit: false,
    result: {
      state: "ready",
      input,
      evidence: liveReport(name, id).evidence,
      queries: 3,
      attempts: 3,
      credits: 3,
      durationMs: 1,
      failedQueries: 0,
    },
  };
  searches.set(id, record);
  return record;
}
function makeReport(search: any): any {
  const id = randomUUID(),
    record = {
      id,
      stage: "report",
      state: "ready",
      input: { searchId: search.id },
      errorCode: null,
      createdAt: now(),
      expiresAt: fresh(),
      cacheHit: false,
      diagnostics: null,
      result: {
        report: liveReport(search.input.businessName, id),
        model: "synthetic-browser-fixture",
        promptVersion: "research-report-2",
        attempts: 1,
        durationMs: 1,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      },
    };
  reportRuns.set(id, record);
  return record;
}
function makeRecommendation(report: ReportV2): any {
  const id = randomUUID(),
    value = {
      id,
      reportId: report.id,
      report,
      state: "ready",
      selection: recordedFor(
        report.mode === "synthetic" ? report.id : "enquiry-flow",
      ).selection,
      model: "synthetic-browser-fixture",
      promptVersion: "service-selector-1",
      createdAt: now(),
      expiresAt: fresh(),
      cacheHit: false,
    };
  recommendations.set(id, value);
  return value;
}
function reply(res: any, value: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
createServer(async (req, res) => {
  try {
    const u = new URL(req.url!, "http://127.0.0.1:3002");
    if (u.pathname.startsWith("/test/seed")) {
      authenticated = true;
      const which = u.searchParams.get("case");
      let values: Record<string, string> = {};
      if (which === "pending-vs-research") {
        const a = makeReport(makeSearch("Pending business A")),
          b = makeReport(makeSearch("Latest business B")),
          rec = makeRecommendation(a.result.report);
        const request = {
          requestId: randomUUID(),
          recommendationId: rec.id,
          selections: rec.selection.items.map(
            ({ serviceId, quantity, disposition }: any) => ({
              serviceId,
              quantity,
              disposition,
            }),
          ),
        };
        drafts.set(request.requestId, {
          snapshot: { snapshot: { report: a.result.report } },
          outcome: {
            state: "unknown",
            snapshotId: "synthetic",
            message: "Synthetic response-loss recovery; check saved progress.",
          },
        });
        values = {
          ["case-generation:" + a.result.report.id]: JSON.stringify(request),
          "case-research-search": b.input.searchId,
          "case-research-report": b.id,
        };
      } else if (which === "stalled-selection") {
        const s = makeSearch("Stalled selection"),
          r = makeReport(s),
          rec = makeRecommendation(r.result.report);
        rec.state = "running";
        rec.selection = null;
        rec.createdAt = new Date(Date.now() - 180000).toISOString();
        values = {
          "case-research-search": s.id,
          "case-research-report": r.id,
          ["case-recommendation:" + r.result.report.id]: rec.id,
        };
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<!doctype html><script>localStorage.clear();for(const [k,v] of Object.entries(" +
          JSON.stringify(values) +
          '))localStorage.setItem(k,v);location.replace("/");</script>',
      );
      return;
    }
    if (u.pathname === "/test/counts") {
      reply(res, counts);
      return;
    }
    if (u.pathname.startsWith("/api/")) {
      let body: any = {};
      if (req.method === "POST") {
        let text = "";
        for await (const chunk of req) text += chunk;
        body = JSON.parse(text || "{}");
      }
      if (u.pathname === "/api/session") {
        if (req.method === "POST")
          authenticated = body.code === "local-ae-verification-1010";
        reply(
          res,
          { authenticated },
          authenticated || req.method !== "POST" ? 200 : 401,
        );
        return;
      }
      if (!authenticated) {
        reply(res, { error: "access_required" }, 401);
        return;
      }
      if (u.pathname === "/api/research") {
        if (req.method === "GET") {
          const r = searches.get(u.searchParams.get("id")!);
          reply(res, { record: r }, r ? 200 : 404);
          return;
        }
        counts.search++;
        const r = makeSearch(body.input.businessName);
        r.input = body.input;
        r.result.input = body.input;
        reply(res, { record: r });
        return;
      }
      if (u.pathname === "/api/reports") {
        if (req.method === "GET") {
          reply(res, { record: reportRuns.get(u.searchParams.get("id")!) });
          return;
        }
        counts.report++;
        const s = searches.get(body.searchId);
        const r = makeReport(s);
        if (
          s.input.businessName === "Report Failure" &&
          !reportFailures.has(s.id)
        ) {
          reportFailures.add(s.id);
          r.state = "failed";
          r.result = null;
          r.expiresAt = null;
          r.errorCode = "research_report_failed";
        }
        if (
          s.input.businessName === "Session Expiry" &&
          !reportFailures.has(s.id)
        ) {
          reportFailures.add(s.id);
          authenticated = false;
          reply(res, { error: "access_required" }, 401);
          return;
        }
        reply(res, { record: r });
        return;
      }
      if (u.pathname === "/api/recommendations") {
        if (req.method === "GET") {
          const rec = recommendations.get(u.searchParams.get("id")!);
          if (rec?.report.businessName === "Pending business A")
            await new Promise((r) => setTimeout(r, 200));
          reply(res, { recommendation: rec }, rec ? 200 : 404);
          return;
        }
        counts.selection++;
        const report =
          reports.find((r) => r.id === body.reportId) ??
          reportRuns.get(body.reportId.slice(5))?.result.report;
        const existing = [...recommendations.values()].find(
          (r) => r.reportId === body.reportId,
        );
        if (existing && !body.refresh) {
          reply(res, { recommendation: { ...existing, cacheHit: true } });
          return;
        }
        const rec = makeRecommendation(report);
        if (
          report.businessName === "Selection Failure" &&
          !selectionFailures.has(report.id)
        ) {
          selectionFailures.add(report.id);
          rec.state = "failed";
          rec.selection = null;
          rec.errorCode = "recommendation_call_failed";
        }
        reply(res, { recommendation: rec });
        return;
      }
      if (u.pathname === "/api/drafts") {
        if (req.method === "GET") {
          counts.status++;
          const value = drafts.get(u.searchParams.get("requestId")!);
          reply(res, value ?? { error: "draft_missing" }, value ? 200 : 404);
          return;
        }
        let value = drafts.get(body.requestId);
        if (!value) {
          counts.create++;
          const rec = recommendations.get(body.recommendationId);
          value = {
            snapshot: { snapshot: { report: rec.report } },
            outcome: {
              state: "confirmed",
              snapshotId: "synthetic",
              providerId: randomUUID(),
              editorUrl: "https://secure.proposales.com/synthetic-browser-qa",
              message: "Synthetic QA draft confirmed; no provider was called.",
            },
          };
          drafts.set(body.requestId, value);
        }
        await new Promise((r) => setTimeout(r, 600));
        reply(res, value);
        return;
      }
    }
    const upstream = await fetch(
      "http://127.0.0.1:3001" + u.pathname + u.search,
      { redirect: "manual" },
    );
    res.writeHead(
      upstream.status,
      Object.fromEntries([...upstream.headers.entries()].filter(([key])=>!["content-encoding","content-length","transfer-encoding"].includes(key))),
    );
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    reply(res, { error: "fixture_failed" }, 500);
  } finally {
    fs.writeFileSync(
      "/tmp/proposales-ae-browser-counts.json",
      JSON.stringify(counts),
    );
  }
}).listen(3002, "127.0.0.1", () =>
  console.log("Synthetic browser fixture http://127.0.0.1:3002"),
);
