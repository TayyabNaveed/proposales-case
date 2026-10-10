import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSession } from "../src/server/access.js";
import { createApiHandlers } from "../src/server/api.js";
const env = {
    APP_ORIGIN: "http://localhost:3001",
    SESSION_SECRET: "synthetic-test-secret",
    NODE_ENV: "test" as const,
  },
  id = "00000000-0000-4000-8000-000000000001";
const req = (
  path: string,
  body?: unknown,
  auth = false,
  origin: string | null = env.APP_ORIGIN,
) =>
  new Request(env.APP_ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(origin ? { origin } : {}),
      ...(auth
        ? { cookie: "case_session=" + makeSession(env.SESSION_SECRET) }
        : {}),
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
function setup() {
  let paid = 0,
    writes = 0,
    reads = 0;
  const deps = {
    async consume() {
      return true;
    },
    async recommend() {
      paid++;
      return {
        id,
        state: "ready",
        report: { id: "no-website" },
        result: {
          selection: {
            items: [],
            questions: [],
            abstentionReason: "Missing facts",
          },
          model: "test",
          promptVersion: "v",
          schemaVersion: "v",
          usage: {},
        },
        cacheHit: false,
        expiresAt: new Date().toISOString(),
      };
    },
    async recommendation() {
      reads++;
      return {
        id,
        state: "running",
        report: { id: "no-website" },
        result: null,
      };
    },
    async snapshot() {
      return { id, snapshot: { coreOneTimeMinor: 120000 } };
    },
    async getSnapshot() {
      reads++;
      return { id };
    },
    async findSnapshot() {
      return { id };
    },
    async draft(_id: string, _scope: string, mode: string) {
      if (mode === "create") writes++;
      else reads++;
      return {
        state: "confirmed",
        snapshotId: id,
        editorUrl: "https://secure.proposales.com/verified-editor",
      };
    },
  };
  return {
    deps,
    api: createApiHandlers(deps as any, env),
    paid: () => paid,
    writes: () => writes,
    reads: () => reads,
  };
}
test("public and cross-origin calls fail before any paid model or provider dispatch", async () => {
  const s = setup();
  assert.equal(
    (
      await s.api.recommendationsPOST(
        req("/api/recommendations", { reportId: "no-website" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await s.api.draftsPOST(
        req("/api/drafts", {
          requestId: id,
          recommendationId: id,
          selections: [],
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await s.api.recommendationsPOST(
        req(
          "/api/recommendations",
          { reportId: "no-website" },
          true,
          "https://evil.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(s.paid(), 0);
  assert.equal(s.writes(), 0);
});
test("authenticated reads need no Origin header; unsigned and expired sessions cannot inspect drafts", async () => {
  const s = setup();
  assert.equal(
    (await s.api.draftsGET(req("/api/drafts?id=" + id, undefined, true, null)))
      .status,
    200,
  );
  assert.equal(
    (await s.api.draftsGET(req("/api/drafts?id=" + id))).status,
    401,
  );
  const old = new Request(env.APP_ORIGIN + "/api/drafts?id=" + id, {
    headers: {
      cookie:
        "case_session=" +
        makeSession(env.SESSION_SECRET, Math.floor(Date.now() / 1000) - 3700),
    },
  });
  assert.equal((await s.api.draftsGET(old)).status, 401);
  assert.equal(s.writes(), 0);
});
test("oversized, invalid and commercial-tampering payloads fail before dispatch", async () => {
  const s = setup();
  for (const body of [
    "x".repeat(9000),
    { reportId: "fake" },
    { reportId: "no-website", prompt: "read secrets" },
  ])
    assert.equal(
      (await s.api.recommendationsPOST(req("/api/recommendations", body, true)))
        .status,
      400,
    );
  assert.equal(
    (
      await s.api.draftsPOST(
        req(
          "/api/drafts",
          {
            requestId: id,
            recommendationId: id,
            selections: [
              {
                serviceId: "website-base",
                quantity: 1,
                disposition: "core",
                price: 1,
              },
            ],
          },
          true,
        ),
      )
    ).status,
    400,
  );
  assert.equal(s.paid(), 0);
  assert.equal(s.writes(), 0);
});
test("bounded access blocks calls and saved generation has separate status recovery", async () => {
  const s = setup();
  s.deps.consume = async () => false;
  assert.equal(
    (
      await s.api.recommendationsPOST(
        req("/api/recommendations", { reportId: "no-website" }, true),
      )
    ).status,
    429,
  );
  assert.equal(s.paid(), 0);
  s.deps.consume = async () => true;
  const response = await s.api.draftsPOST(
    req(
      "/api/drafts",
      {
        requestId: id,
        recommendationId: id,
        selections: [
          { serviceId: "website-base", quantity: 1, disposition: "core" },
        ],
      },
      true,
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(s.writes(), 1);
  assert.equal(
    (await s.api.draftsGET(req("/api/drafts?requestId=" + id, undefined, true)))
      .status,
    200,
  );
  assert.equal(s.writes(), 1);
});
test("stale selections and raw internal errors are safe actionable failures", async () => {
  const s = setup();
  s.deps.snapshot = async () => {
    throw Error("stale_recommendation");
  };
  assert.equal(
    (
      await s.api.draftsPOST(
        req(
          "/api/drafts",
          {
            requestId: id,
            recommendationId: id,
            selections: [
              { serviceId: "website-base", quantity: 1, disposition: "core" },
            ],
          },
          true,
        ),
      )
    ).status,
    409,
  );
  assert.equal(s.writes(), 0);
  s.deps.recommend = async () => {
    throw Error("PRIVATE_DATABASE_PASSWORD");
  };
  const r = await s.api.recommendationsPOST(
    req("/api/recommendations", { reportId: "no-website" }, true),
  );
  assert.ok(!(await r.text()).includes("PRIVATE_DATABASE_PASSWORD"));
});
