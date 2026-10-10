import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessProbe,
  probeStructuredModel,
} from "../src/server/providers/deepseek.js";
const supported = {
  businessName: "Northstar Bicycle Workshop",
  websiteStatus: "unknown",
  evidenceIds: ["s1"],
};
const response = (output: unknown) =>
  new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 1,
      model: "deepseek-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(output) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
test("schema-valid absence claim fails support check", () => {
  assert.deepEqual(assessProbe({ ...supported, websiteStatus: "absent" }), {
    schemaValid: true,
    evidenceSupported: false,
  });
  assert.deepEqual(assessProbe(supported), {
    schemaValid: true,
    evidenceSupported: true,
  });
});
test("unknown evidence and malformed output cannot pass", () => {
  assert.equal(
    assessProbe({ ...supported, evidenceIds: ["invented"] }).evidenceSupported,
    false,
  );
  assert.deepEqual(assessProbe({ businessName: 23 }), {
    schemaValid: false,
    evidenceSupported: false,
  });
});
test("SDK sends bounded direct DeepSeek request and returns usage", async () => {
  let calls = 0;
  const result = await probeStructuredModel({
    apiKey: "synthetic-key",
    model: "deepseek-flash",
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      assert.equal(String(url), "https://api.deepseek.com/chat/completions");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.max_tokens, 300);
      assert.equal(body.model, "deepseek-flash");
      assert.equal(body.thinking.type, "disabled");
      return response(supported);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.schemaValid, true);
  assert.equal(result.evidenceSupported, true);
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 30);
});
test("SDK retries disabled and raw provider errors are not surfaced", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      probeStructuredModel({
        apiKey: "private-key",
        model: "deepseek-flash",
        fetch: async () => {
          calls++;
          return new Response("private-key", { status: 500 });
        },
      }),
    /model_call_failed/,
  );
  assert.equal(calls, 1);
});
test("malformed model object fails safely", async () => {
  await assert.rejects(
    () =>
      probeStructuredModel({
        apiKey: "key",
        model: "deepseek-flash",
        fetch: async () => response({ businessName: 23 }),
      }),
    /model_call_failed/,
  );
});
test("cancellation aborts an in-flight model request", async () => {
  const controller = new AbortController();
  await assert.rejects(
    () =>
      probeStructuredModel({
        apiKey: "key",
        model: "deepseek-flash",
        signal: controller.signal,
        fetch: async (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
            controller.abort();
          }),
      }),
    /model_call_failed/,
  );
});
