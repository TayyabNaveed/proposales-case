// Local browser QA only: synthetic API responses, no credentials or provider calls.
// Proxies page/assets from the built app on3001. Bind only loopback3002.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { reports, type ReportV2 } from "../src/domain/reports.js";
import { recordedFor } from "../src/domain/workbench.js";
const searches = new Map<string, any>(),
  identifyRuns = new Map<string, any>(),
  reportRuns = new Map<string, any>(),
  recommendations = new Map<string, any>(),
  drafts = new Map<string, any>();
const counts = { search: 0, identify: 0, report: 0, selection: 0, create: 0, status: 0 };
let authenticated = false, expireIntro = false, slowSelection = false, expireReport = false;
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
// "Two Matches" yields two candidates and "No Match" none, to exercise the dialog.
function makeIdentify(search: any): any {
  const id = randomUUID(),
    ev = search.result.evidence,
    name = search.input.businessName;
  const one = (sourceId: string, text: string, place: string) => ({
    sourceIds: [sourceId],
    name: { sourceId, text },
    location: { sourceId, text: place },
    websiteSourceIds: [sourceId],
  });
  const candidates =
    name === "No Match"
      ? []
      : name === "Two Matches"
        ? [one(ev[0].id, name + " AB", "Stockholm"), one(ev[1].id, name, "Solna")]
        : [one(ev[0].id, name, "Stockholm")];
  const record = {
    id,
    stage: "identify",
    state: "ready",
    input: { searchId: search.id },
    errorCode: null,
    createdAt: now(),
    expiresAt: fresh(),
    cacheHit: false,
    diagnostics: null,
    result: {
      model: "synthetic-browser-fixture",
      promptVersion: "business-identity-1",
      attempts: 1,
      durationMs: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      status: candidates.length === 1 ? "confirmed" : "ambiguous",
      identity: {
        reason: "Synthetic browser fixture.",
        matchedSourceIds: candidates.length === 1 ? candidates[0].sourceIds : [],
        candidates,
        rejected: [],
      },
    },
  };
  identifyRuns.set(id, record);
  return record;
}
function makeReport(search: any, identifyId?: string, choice?: any): any {
  const id = randomUUID(),
    record = {
      id,
      stage: "report",
      state: "ready",
      input: { searchId: search.id, identifyId, choice },
      errorCode: null,
      createdAt: now(),
      expiresAt: fresh(),
      cacheHit: false,
      diagnostics: null,
      result: {
        report: liveReport(search.input.businessName, id),
        model: "synthetic-browser-fixture",
        promptVersion: "research-report-7",
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
    if (u.pathname === "/test/storage") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><h1>Synthetic storage events</h1>
        <button onclick="localStorage.setItem('qa-unrelated', String(Date.now()))">Write unrelated key</button>
        <button onclick="localStorage.setItem('case-recommendation:no-website', localStorage.getItem('case-recommendation:no-website'));localStorage.setItem('case-generation:enquiry-flow','null');localStorage.removeItem('case-generation:enquiry-flow')">Notify other report</button>
        <button onclick="location.href='/test/save-pending'">Save pending request</button>`);
      return;
    }
    if (u.pathname === "/test/save-pending") {
      const rec = [...recommendations.values()].find(r => r.reportId === "no-website");
      const request = { requestId: randomUUID(), recommendationId: rec.id,
        selections: rec.selection.items.map(({ serviceId, quantity, disposition }: any) => ({ serviceId, quantity, disposition })) };
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><script>localStorage.setItem('case-generation:no-website'," + JSON.stringify(JSON.stringify(request)) + ");location.replace('/test/storage');</script>");
      return;
    }
    // Another tab preparing the recorded example: its suggestions get an ID.
    if (u.pathname === "/test/prepare-example") {
      const rec = makeRecommendation(reports[0]);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><h1>Prepared in another tab</h1><script>localStorage.setItem('case-recommendation:no-website'," + JSON.stringify(rec.id) + ");</script>");
      return;
    }
    if (u.pathname.startsWith("/test/seed")) {
      authenticated = true;
      const which = u.searchParams.get("case");
      expireIntro = which === "expiry-intro";
      slowSelection = which === "busy-storage";
      expireReport = which === "expiry-choice";
      let values: Record<string, string> = {};
      if (["unreadable", "unsaved", "expired-unsaved", "recipient-mismatch", "expiry-intro", "editable", "busy-storage"].includes(which ?? "")) {
        const rec = makeRecommendation(reports[0]);
        if (which === "expired-unsaved") rec.expiresAt = new Date(Date.now() - 1000).toISOString();
        const request = { requestId: randomUUID(), recommendationId: rec.id,
          selections: rec.selection.items.map(({ serviceId, quantity, disposition }: any) => ({ serviceId, quantity, disposition })),
          presentation: { intro: "Keep this approved introduction.", recipient: { companyName: "QA Studio" } },
        };
        values = { "case-recommendation:no-website": rec.id };
        if (which === "unreadable") values["case-generation:no-website"] = "{broken";
        if (which === "unsaved" || which === "expired-unsaved") values["case-generation:no-website"] = JSON.stringify(request);
        // Proposales reused an existing contact with this email (observed 11 October).
        if (which === "recipient-mismatch") {
          drafts.set(request.requestId, {
            snapshot: { snapshot: { report: reports[0] } },
            outcome: {
              state: "verification_failed",
              snapshotId: "synthetic",
              providerId: randomUUID(),
              editorUrl: "https://secure.proposales.com/synthetic-browser-qa",
              issues: ["recipient"],
              message: "A draft exists, but verification or its editor link is incomplete. Inspect the existing proposal; do not recreate it.",
            },
          });
          values["case-generation:no-website"] = JSON.stringify(request);
        }
      } else if (which === "pending-vs-research") {
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
      } else if (which === "no-suggestions") {
        const s = makeSearch("Quiet Burgers"),
          i = makeIdentify(s),
          r = makeReport(s, i.id),
          rec = makeRecommendation(r.result.report);
        rec.selection = {
          items: [],
          questions: ["Confirm which locations the proposal should cover."],
          abstentionReason:
            "The business has a confirmed website and several locations, but no evidenced need maps to a catalogue service.",
        };
        values = {
          "case-research-search": s.id,
          "case-research-identify": i.id,
          "case-research-report": r.id,
          ["case-recommendation:" + r.result.report.id]: rec.id,
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
      if (u.pathname === "/api/intro") {
        if (expireIntro) {
          authenticated = false;
          reply(res, { error: "access_required" }, 401);
        } else reply(res, { intro: { state: "ready", text: "A focused first step for your business.", dropped: 0, errorCode: null } });
        return;
      }
      if (u.pathname === "/api/usage") {
        const period = { searches: 3, credits: 12, aiRuns: 4, tokens: 41200 };
        reply(res, { today: period, month: { ...period, searches: 18, aiRuns: 22, tokens: 236000 } });
        return;
      }
      if (u.pathname === "/api/proposals") {
        const row = (status: string, businessName: string, i: number) => ({
          snapshotId: "synthetic-" + i,
          createdAt: now(),
          businessName,
          mode: "synthetic",
          totals: { coreOneTimeMinor: 180000, coreMonthlyMinor: 8000, optionalOneTimeMinor: 55000, optionalMonthlyMinor: 0 },
          recipient: { companyName: businessName, contactName: "Example Contact", email: "contact@example.com" },
          changes: { kept: 3, removed: [], added: [] },
          questions: ["Confirm the monthly budget.", "Confirm who maintains the site content."],
          providerId: randomUUID(),
          editorUrl: "https://secure.proposales.com/synthetic-browser-qa",
          status,
          statusChangedAt: null,
          pdfUrl: status === "accepted" ? "https://esign.proposales.com/pdf/synthetic-browser-qa" : null,
          liveUrl: "https://secure.proposales.com/proposals/synthetic-browser-qa/" + (status === "accepted" ? "view" : "edit"),
        });
        reply(res, {
          proposals: [
            row("draft", reports[0].businessName, 1),
            row("draft", reports[1].businessName, 2),
            row("active", reports[1].businessName, 3),
            row("accepted", reports[0].businessName, 4),
            { ...row("outcome_unknown", "Uncertain QA proposal", 5), providerId: null, editorUrl: null, liveUrl: null },
          ],
        });
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
      if (u.pathname === "/api/identify") {
        if (req.method === "GET") {
          const r = identifyRuns.get(u.searchParams.get("id")!);
          reply(res, { record: r }, r ? 200 : 404);
          return;
        }
        counts.identify++;
        reply(res, { record: makeIdentify(searches.get(body.searchId)) });
        return;
      }
      if (u.pathname === "/api/reports") {
        if (req.method === "GET") {
          reply(res, { record: reportRuns.get(u.searchParams.get("id")!) });
          return;
        }
        if (expireReport) {
          authenticated = false;
          reply(res, { error: "access_required" }, 401);
          return;
        }
        counts.report++;
        const s = searches.get(body.searchId);
        const r = makeReport(s, body.identifyId, body.choice);
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
        if (slowSelection) await new Promise(resolve => setTimeout(resolve, 4000));
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
          const value = drafts.get(u.searchParams.get("requestId")!),
            rec = recommendations.get(u.searchParams.get("recommendationId") ?? "");
          if (!value && rec && Date.parse(rec.expiresAt) <= Date.now()) {
            reply(res, {
              snapshot: null,
              outcome: {
                state: "expired",
                snapshotId: "",
                message: "These suggestions expired before the saved request reached the server, so nothing was created. Request fresh suggestions to continue.",
              },
            });
            return;
          }
          reply(res, value ?? {
            snapshot: null,
            outcome: {
              state: "not_started",
              snapshotId: "",
              message: "This request has not been saved on the server. Retry the saved request to continue.",
            },
          });
          return;
        }
        let value = drafts.get(body.requestId);
        if (!value && Date.parse(recommendations.get(body.recommendationId).expiresAt) <= Date.now()) {
          reply(res, { error: "stale_recommendation" }, 409);
          return;
        }
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
      reply(res, { error: "fixture_route_missing" }, 404);
      return;
    }
    const upstream = await fetch(
      (process.env.BROWSER_QA_UPSTREAM ?? "http://127.0.0.1:3001") + u.pathname + u.search,
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
