import { test } from "node:test";
import assert from "node:assert/strict";
import { APICallError } from "ai";
import { aiFailureCode, searchStatusCode, searchErrorCode } from "../src/server/provider-errors.js";

test("web search failures name their cause, including exhausted credits", () => {
  assert.equal(searchStatusCode(432), "search_credits_exhausted");
  assert.equal(searchStatusCode(433), "search_credits_exhausted");
  assert.equal(searchStatusCode(401), "search_auth");
  assert.equal(searchStatusCode(403), "search_auth");
  assert.equal(searchStatusCode(429), "search_rate_limited");
  assert.equal(searchStatusCode(503), "search_unavailable");
  assert.equal(searchStatusCode(400), "search_rejected");
  const timeout = new DOMException("t", "TimeoutError");
  assert.equal(searchErrorCode(timeout), "search_timeout");
  assert.equal(searchErrorCode(new SyntaxError("bad json")), "search_invalid_response");
  assert.equal(searchErrorCode(new TypeError("fetch failed")), "search_network");
});

test("AI failures name their cause, including an empty balance", () => {
  const call = (statusCode: number) =>
    new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode });
  assert.equal(aiFailureCode(call(402)), "ai_balance_empty");
  assert.equal(aiFailureCode(call(401)), "ai_auth");
  assert.equal(aiFailureCode(call(429)), "ai_rate_limited");
  assert.equal(aiFailureCode(call(500)), "ai_unavailable");
  assert.equal(aiFailureCode(call(400)), "ai_rejected");
  assert.equal(aiFailureCode(new DOMException("t", "TimeoutError")), "ai_timeout");
  assert.equal(aiFailureCode(new DOMException("a", "AbortError")), "ai_timeout");
  assert.equal(aiFailureCode(new TypeError("fetch failed")), "ai_network");
});

test("every failure category has a message that says what to do", async () => {
  const { explanations } = await import("../src/components/workbench/api.js");
  for (const code of [
    "search_credits_exhausted", "search_auth", "search_rate_limited", "search_unavailable", "search_timeout",
    "ai_balance_empty", "ai_auth", "ai_rate_limited", "ai_unavailable", "ai_timeout", "output_schema",
  ])
    assert.ok(explanations[code], code);
});

test("exhausted search credits reach the operator as that cause, without a pointless retry", async () => {
  const { searchBusiness } = await import("../src/server/providers/research.js");
  const { identifyStep } = await import("../src/domain/analysis-flow.js");
  let calls = 0;
  const r = await searchBusiness(
    { businessName: "Juniper", location: "Stockholm", website: undefined },
    { apiKey: "synthetic", fetch: async () => (calls++, new Response("", { status: 432 })) },
  );
  assert.equal(r.state, "partial");
  assert.equal(r.failure, "search_credits_exhausted");
  assert.equal(calls, 3); // one per query; a usage limit is not retried
  await assert.rejects(
    identifyStep({
      input: { businessName: "Juniper", location: "Stockholm", website: undefined },
      request: async () => ({ id: "s", stage: "search", state: "partial", input: {}, result: r, createdAt: "", expiresAt: null }) as any,
      isCurrent: () => true,
      onProgress: () => {},
      onSearch: () => {},
      onIdentify: () => {},
    }),
    (e: any) => e.code === "search_credits_exhausted",
  );
});

test("an empty AI balance is recorded as that cause on the failed stage", async () => {
  const { identifyBusiness } = await import("../src/server/providers/research.js");
  const evidence = [
    { id: "s1", label: "Juniper", excerpt: "Juniper Stockholm.", synthetic: false, url: "https://juniper.example/", retrievedAt: "2026-10-10T12:00:00.000Z" },
  ];
  await assert.rejects(
    identifyBusiness({ businessName: "Juniper", location: "Stockholm", website: undefined }, evidence, {
      apiKey: "synthetic",
      model: "deepseek-flash",
      fetch: async () => Response.json({ error: { message: "Insufficient Balance" } }, { status: 402 }),
    }),
    (e: any) => e.diagnostics.check === "ai_balance_empty" && e.diagnostics.failure === "provider_failed",
  );
});
