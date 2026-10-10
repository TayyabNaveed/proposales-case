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
const report = {
  id: "report",
  stage: "report",
  state: "ready",
  input: { searchId: "search" },
  result: { report: { ...reports[1], id: "live-report" } },
  createdAt: new Date().toISOString(),
  expiresAt: fresh,
} as any;
test("deliberate analysis progresses in order and publishes report before selecting services", async () => {
  const { analyseBusiness } = await import("../src/domain/analysis-flow.js");
  const calls: string[] = [];
  await analyseBusiness({
    input,
    request: async (path: string) => {
      calls.push(path);
      return path === "/api/research" ? search : report;
    },
    isCurrent: () => true,
    onSearch: () => {},
    onReport: () => {
      calls.push("report-visible");
    },
    onProgress: () => {},
    recommend: async () => {
      calls.push("selection");
    },
  });
  assert.deepEqual(calls, [
    "/api/research",
    "/api/reports",
    "report-visible",
    "selection",
  ]);
});
test("report retry keeps sources and recommendation retry keeps report; reopening performs no work by itself", async () => {
  const { analyseBusiness } = await import("../src/domain/analysis-flow.js");
  const calls: unknown[] = [];
  const deps = {
    input,
    search,
    report: { ...report, state: "failed", result: null },
    request: async (path: string, body: unknown) => {
      calls.push({ path, body });
      return report;
    },
    isCurrent: () => true,
    onSearch: () => {},
    onReport: () => {},
    onProgress: () => {},
    recommend: async () => {
      calls.push("selection");
    },
  };
  await analyseBusiness(deps);
  assert.deepEqual(calls, [
    { path: "/api/reports", body: { searchId: "search", refresh: true } },
    "selection",
  ]);
  calls.length = 0;
  await analyseBusiness({ ...deps, report });
  assert.deepEqual(calls, ["selection"]);
});
test("stale results cannot advance into another business or dispatch further paid stages", async () => {
  const { analyseBusiness } = await import("../src/domain/analysis-flow.js");
  let current = true;
  const calls: string[] = [];
  await analyseBusiness({
    input,
    request: async (path: string) => {
      calls.push(path);
      current = false;
      return search;
    },
    isCurrent: () => current,
    onSearch: () => {
      throw Error("stale publish");
    },
    onReport: () => {},
    onProgress: () => {},
    recommend: async () => {
      throw Error("stale paid work");
    },
  });
  assert.deepEqual(calls, ["/api/research"]);
});
test("partial and running stages stop progression and cannot silently become examples", async () => {
  const { analyseBusiness } = await import("../src/domain/analysis-flow.js");
  let writes = 0;
  for (const state of ["partial", "running"])
    await assert.rejects(
      analyseBusiness({
        input,
        request: async () => {
          writes++;
          return { ...search, state };
        },
        isCurrent: () => true,
        onSearch: () => {},
        onReport: () => {},
        onProgress: () => {},
        recommend: async () => {
          throw Error("dispatch");
        },
      }),
      /sources|progress/i,
    );
  assert.equal(writes, 2);
});
