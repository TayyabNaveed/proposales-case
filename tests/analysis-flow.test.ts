import { test } from "node:test";
import assert from "node:assert/strict";
import { reports } from "../src/domain/reports.js";
const input = {
  businessName: "Juniper",
  location: "Stockholm",
  website: undefined,
};
const fresh = new Date(Date.now() + 86400000).toISOString();
const search = {
  id: "search",
  stage: "search",
  state: "ready",
  input,
  result: { input, evidence: [] },
  createdAt: new Date().toISOString(),
  expiresAt: fresh,
} as any;
const identified = {
  id: "identify",
  stage: "identify",
  state: "ready",
  input: { searchId: "search" },
  result: { status: "confirmed", identity: { candidates: [{}] } },
  createdAt: new Date().toISOString(),
  expiresAt: fresh,
} as any;
const choice = { candidate: 0, website: { kind: "none" as const } };
const report = {
  id: "report",
  stage: "report",
  state: "ready",
  input: { searchId: "search", identifyId: "identify", choice },
  result: { report: { ...reports[1], id: "live-report" } },
  createdAt: new Date().toISOString(),
  expiresAt: fresh,
} as any;
const quiet = { isCurrent: () => true, onProgress: () => {} };

test("identify runs search then identify and stops for the operator's choice", async () => {
  const { identifyStep } = await import("../src/domain/analysis-flow.js");
  const calls: string[] = [];
  const r = await identifyStep({
    ...quiet,
    input,
    request: async (path: string) => {
      calls.push(path);
      return path === "/api/research" ? search : identified;
    },
    onSearch: () => calls.push("sources-saved"),
    onIdentify: () => calls.push("choose"),
  });
  assert.equal(r?.id, "identify");
  assert.deepEqual(calls, ["/api/research", "sources-saved", "/api/identify", "choose"]);
});

test("after the choice, the report is published before services are suggested", async () => {
  const { continueWithChoice } = await import("../src/domain/analysis-flow.js");
  const calls: unknown[] = [];
  await continueWithChoice({
    ...quiet,
    search,
    identify: identified,
    choice,
    request: async (path: string, body: unknown) => {
      calls.push({ path, body });
      return report;
    },
    onSavedReport: () => {},
    onReport: () => calls.push("report-visible"),
    recommend: async () => {
      calls.push("selection");
    },
  });
  assert.deepEqual(calls, [
    {
      path: "/api/reports",
      body: { searchId: "search", identifyId: "identify", choice, refresh: false },
    },
    "report-visible",
    "selection",
  ]);
});

test("a saved report is reused only for the same choice; a failed one is retried explicitly", async () => {
  const { continueWithChoice } = await import("../src/domain/analysis-flow.js");
  const calls: unknown[] = [];
  const deps = {
    ...quiet,
    search,
    identify: identified,
    choice,
    request: async (path: string, body: unknown) => {
      calls.push({ path, body });
      return report;
    },
    onSavedReport: () => {},
    onReport: () => {},
    recommend: async () => {
      calls.push("selection");
    },
  };
  await continueWithChoice({ ...deps, report });
  assert.deepEqual(calls, ["selection"]);
  calls.length = 0;
  const other = { candidate: 0, website: { kind: "typed" as const, url: "https://juniper.example" } };
  await continueWithChoice({ ...deps, report, choice: other });
  assert.equal((calls[0] as any).body.refresh, false);
  calls.length = 0;
  await continueWithChoice({ ...deps, report: { ...report, state: "failed", result: null } });
  assert.equal((calls[0] as any).body.refresh, true);
});

test("stale results cannot advance into another business or dispatch further paid stages", async () => {
  const { identifyStep } = await import("../src/domain/analysis-flow.js");
  let current = true;
  const calls: string[] = [];
  await identifyStep({
    input,
    request: async (path: string) => {
      calls.push(path);
      current = false;
      return search;
    },
    isCurrent: () => current,
    onProgress: () => {},
    onSearch: () => {
      throw Error("stale publish");
    },
    onIdentify: () => {
      throw Error("stale paid work");
    },
  });
  assert.deepEqual(calls, ["/api/research"]);
});

test("partial and running stages stop progression and cannot silently become examples", async () => {
  const { identifyStep } = await import("../src/domain/analysis-flow.js");
  let writes = 0;
  for (const state of ["partial", "running"])
    await assert.rejects(
      identifyStep({
        ...quiet,
        input,
        request: async () => {
          writes++;
          return { ...search, state };
        },
        onSearch: () => {},
        onIdentify: () => {
          throw Error("dispatch");
        },
      }),
      /sources|progress/i,
    );
  assert.equal(writes, 2);
});
