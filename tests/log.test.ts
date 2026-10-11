import { test } from "node:test";
import assert from "node:assert/strict";
import { logEvent, withRequestLog } from "../src/server/log.js";
import { safeError } from "../src/server/http.js";

async function capture(run: () => Promise<unknown> | unknown) {
  const lines: { level: string; value: Record<string, unknown> }[] = [];
  const original = { error: console.error, warn: console.warn, info: console.info };
  for (const level of ["error", "warn", "info"] as const)
    console[level] = (text: string) =>
      lines.push({ level, value: JSON.parse(text) });
  try {
    await run();
  } finally {
    Object.assign(console, original);
  }
  return lines;
}
const req = (method = "POST") =>
  new Request("http://localhost/api/drafts", { method });

test("a failed request logs one line whose request ID matches the response", async () => {
  let response: Response | undefined;
  const lines = await capture(async () => {
    response = await withRequestLog("drafts", async () =>
      Response.json({ error: "stale_recommendation" }, { status: 409 }),
    )(req());
  });
  assert.equal(lines.length, 1);
  const [{ level, value }] = lines;
  assert.equal(level, "warn");
  assert.equal(value.event, "request_error");
  assert.equal(value.route, "drafts");
  assert.equal(value.method, "POST");
  assert.equal(value.status, 409);
  assert.equal(value.code, "stale_recommendation");
  assert.equal(typeof value.durationMs, "number");
  assert.equal(value.requestId, response!.headers.get("x-request-id"));
  assert.equal((await response!.json()).error, "stale_recommendation");
});

test("successful requests write nothing", async () => {
  const lines = await capture(() =>
    withRequestLog("usage", async () => Response.json({ ok: true }))(req("GET")),
  );
  assert.deepEqual(lines, []);
});

test("an unexpected error is a logged 500 without its message", async () => {
  const privateText = "client note: owner prefers Tuesday calls";
  let response: Response | undefined;
  const lines = await capture(async () => {
    response = await withRequestLog("drafts", async () =>
      safeError(new TypeError(privateText)),
    )(req());
  });
  assert.equal(response!.status, 500);
  assert.equal((await response!.json()).error, "request_failed");
  const unexpected = lines.find((l) => l.value.event === "unexpected_error")!;
  assert.equal(unexpected.level, "error");
  assert.equal(unexpected.value.errorName, "TypeError");
  assert.equal(unexpected.value.route, "drafts");
  assert.match(String(unexpected.value.stack), /at /);
  const failed = lines.find((l) => l.value.event === "request_error")!;
  assert.equal(failed.level, "error");
  assert.equal(failed.value.requestId, unexpected.value.requestId);
  assert.ok(!JSON.stringify(lines).includes("Tuesday"));
});

test("known error codes keep their status and are not reported as defects", async () => {
  const lines = await capture(async () => {
    const r = safeError(new Error("draft_request_conflict"));
    assert.equal(r.status, 409);
  });
  assert.deepEqual(lines, []);
});

test("a handler that throws is logged and still fails", async () => {
  const lines = await capture(() =>
    assert.rejects(
      withRequestLog("reports", async () => {
        throw new RangeError("Quiet Burgers, Stockholm");
      })(req()),
      RangeError,
    ),
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].value.event, "request_crashed");
  assert.equal(lines[0].value.errorName, "RangeError");
  assert.ok(!JSON.stringify(lines).includes("Quiet Burgers"));
});

test("only scalar fields are written", async () => {
  const lines = await capture(() =>
    logEvent("info", "probe", {
      runId: "r1",
      attempts: 2,
      ok: true,
      none: null,
      skipped: undefined,
      report: { businessName: "Private" } as never,
    }),
  );
  assert.deepEqual(lines[0].value, {
    level: "info",
    event: "probe",
    runId: "r1",
    attempts: 2,
    ok: true,
    none: null,
  });
});
