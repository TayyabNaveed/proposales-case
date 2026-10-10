import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSession } from "../src/server/access.js";
const env = {
  NODE_ENV: "test",
  APP_ORIGIN: "http://127.0.0.1:3001",
  SESSION_SECRET: "synthetic-session-secret-long-enough",
} as NodeJS.ProcessEnv;
const req = (
  path: string,
  body?: unknown,
  auth = true,
  origin = env.APP_ORIGIN,
) =>
  new Request(env.APP_ORIGIN + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(auth
        ? { cookie: "case_session=" + makeSession(env.SESSION_SECRET!) }
        : {}),
      ...(body ? { origin: origin!, "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("research/report routes authorise, validate and bound before paid work; scope-owned status reads do not need Origin", async () => {
  const { createResearchApi } = await import("../src/server/research-api.js");
  let calls = 0;
  const handlers = createResearchApi(
    {
      consume: async () => true,
      search: async () => {
        calls++;
        return {
          id: "x",
          stage: "search",
          state: "running",
          input: { businessName: "Juniper", location: "Stockholm" },
          result: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          errorCode: null,
          cacheHit: false,
        } as any;
      },
      report: async () => {
        calls++;
        return {} as any;
      },
      get: async (id, scope) => {
        assert.equal(scope, "reviewer");
        return {
          id,
          stage: "search",
          state: "running",
          input: { businessName: "Juniper", location: "Stockholm" },
          result: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          errorCode: null,
          cacheHit: false,
        } as any;
      },
    },
    env,
  );
  assert.equal(
    (
      await handlers.searchPOST(
        req(
          "/api/research",
          { input: { businessName: "Juniper", location: "Stockholm" } },
          false,
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handlers.searchPOST(
        req(
          "/api/research",
          { input: { businessName: "Juniper", location: "Stockholm" } },
          true,
          "https://other.example",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handlers.searchPOST(
        req("/api/research", {
          input: {
            businessName: "Juniper",
            location: "Stockholm",
            prompt: "invent",
          },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await handlers.reportPOST(req("/api/reports", { searchId: "bad" })))
      .status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await handlers.searchPOST(
        req("/api/research", {
          input: { businessName: "Juniper", location: "Stockholm" },
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await handlers.GET(
        req("/api/research?id=17118dfa-57c6-4d6d-8c19-c615c34dd9f1"),
        "search",
      )
    ).status,
    200,
  );
  const limited = createResearchApi(
    {
      consume: async () => false,
      search: async () => {
        throw Error("dispatch");
      },
      report: async () => {
        throw Error("dispatch");
      },
      get: async () => {
        throw Error("dispatch");
      },
    },
    env,
  );
  assert.equal(
    (
      await limited.searchPOST(
        req("/api/research", {
          input: { businessName: "Juniper", location: "Stockholm" },
        }),
      )
    ).status,
    429,
  );
});
