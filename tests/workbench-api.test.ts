import { test } from "node:test";
import assert from "node:assert/strict";
import { apiRequest, WorkbenchError } from "../src/components/workbench/api.js";

test("HTML and broken network responses show availability messages and preserve expiry handling", async () => {
  const original = globalThis.fetch;
  let expired = 0;
  try {
    for (const response of [
      new Response("<html>bad gateway</html>", { status: 502 }),
      new Response("", { status: 401 }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        apiRequest("/api/drafts", undefined, () => expired++),
        (e: any) =>
          e instanceof WorkbenchError &&
          /temporarily unavailable/i.test(e.message),
      );
    }
    assert.equal(expired, 1);
    globalThis.fetch = async () => {
      throw Error("PRIVATE transport detail");
    };
    await assert.rejects(
      apiRequest("/api/drafts", undefined, () => expired++),
      (e: any) =>
        e instanceof WorkbenchError &&
        /temporarily unavailable/i.test(e.message),
    );
    globalThis.fetch = async () =>
      Response.json({ error: "too_many_attempts" }, { status: 429 });
    await assert.rejects(
      apiRequest("/api/drafts", undefined, () => expired++),
      (e: any) => e.code === "too_many_attempts",
    );
  } finally {
    globalThis.fetch = original;
  }
});
