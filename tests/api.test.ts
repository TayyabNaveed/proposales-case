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
    async resolveRequest() {
      return { snapshot: { id }, expired: false };
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

test("a request with no scoped snapshot is not started; checking never dispatches a create", async () => {
  const s = setup();
  s.deps.findSnapshot = async () => null as any;
  s.deps.draft = async () => {
    throw Error("status must not run without a snapshot");
  };
  const response = await s.api.draftsGET(
    req("/api/drafts?requestId=" + id, undefined, true),
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.snapshot, null);
  assert.equal(value.outcome.state, "not_started");
  assert.equal(value.outcome.snapshotId, "");
  assert.match(value.outcome.message, /retry.*saved request/i);
  assert.equal(s.writes(), 0);
  assert.equal(
    (await s.api.draftsGET(req("/api/drafts?requestId=" + id))).status,
    401,
  );
});

test("missing snapshot IDs still fail and lookup failures never authorise retry", async () => {
  const s = setup();
  s.deps.getSnapshot = async () => {
    throw Error("draft_missing");
  };
  const missing = await s.api.draftsGET(
    req("/api/drafts?id=" + id, undefined, true),
  );
  assert.equal((await missing.json()).error, "draft_missing");
  s.deps.findSnapshot = async () => {
    throw Error("database_unavailable");
  };
  const failed = await s.api.draftsGET(
    req("/api/drafts?requestId=" + id, undefined, true),
  );
  assert.equal(failed.ok, false);
  assert.equal((await failed.json()).outcome, undefined);
  assert.equal(s.writes(), 0);
});

test("restored unsaved request retries with its original ID, scope and approved text", async () => {
  const { restorePendingGeneration, isSettledOutcome } =
    await import("../src/domain/workbench.js");
  const saved = {
    requestId: id,
    recommendationId: id,
    selections: [
      { serviceId: "website-base", quantity: 1, disposition: "core" },
    ],
    presentation: {
      intro: "Our agreed first step.",
      recipient: { companyName: "Example Studio" },
    },
  };
  const pending = restorePendingGeneration(JSON.stringify(saved))!;
  const s = setup();
  s.deps.findSnapshot = async () => null as any;
  const status = await s.api.draftsGET(
    req("/api/drafts?requestId=" + pending.requestId, undefined, true),
  );
  const { outcome } = await status.json();
  assert.equal(outcome.state, "not_started");
  assert.equal(isSettledOutcome(outcome), false);
  let received: unknown[] = [];
  s.deps.snapshot = async (...args: unknown[]) => {
    received = args;
    return { id, snapshot: { coreOneTimeMinor: 120000 } };
  };
  const retried = await s.api.draftsPOST(req("/api/drafts", pending, true));
  assert.equal(retried.status, 200);
  assert.equal(received[0], saved.requestId);
  assert.equal(received[1], saved.recommendationId);
  assert.deepEqual(received[2], saved.selections);
  assert.deepEqual(received[4], saved.presentation);
  assert.equal(s.writes(), 1);
});

test("a saved request whose suggestions expired is settled authoritatively and never dispatched", async () => {
  const { isSettledOutcome } = await import("../src/domain/workbench.js");
  const s = setup();
  const rec = "00000000-0000-4000-8000-000000000002";
  let asked: unknown[] = [];
  s.deps.resolveRequest = async (...args: unknown[]) => {
    asked = args;
    return { snapshot: null, expired: true } as any;
  };
  s.deps.findSnapshot = async () => {
    throw Error("an unqualified lookup must not decide this request");
  };
  s.deps.draft = async () => {
    throw Error("status must not run without a snapshot");
  };
  const response = await s.api.draftsGET(
    req(`/api/drafts?requestId=${id}&recommendationId=${rec}`, undefined, true),
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.snapshot, null);
  assert.equal(value.outcome.state, "expired");
  assert.match(value.outcome.message, /nothing was created/);
  assert.equal(isSettledOutcome(value.outcome), true);
  assert.equal(asked[0], id);
  assert.equal(asked[1], rec);
  assert.equal(s.writes(), 0);
});

test("a resolved request that another tab saved reports that snapshot's status", async () => {
  const s = setup();
  s.deps.resolveRequest = async () =>
    ({ snapshot: { id }, expired: false }) as any;
  const value = await (
    await s.api.draftsGET(
      req(
        `/api/drafts?requestId=${id}&recommendationId=${id}`,
        undefined,
        true,
      ),
    )
  ).json();
  assert.equal(value.outcome.state, "confirmed");
  s.deps.resolveRequest = async () =>
    ({ snapshot: null, expired: false }) as any;
  const absent = await (
    await s.api.draftsGET(
      req(
        `/api/drafts?requestId=${id}&recommendationId=${id}`,
        undefined,
        true,
      ),
    )
  ).json();
  assert.equal(absent.outcome.state, "not_started");
  const mixed = await s.api.draftsGET(
    req(`/api/drafts?id=${id}&recommendationId=${id}`, undefined, true),
  );
  assert.equal((await mixed.json()).error, "invalid_input");
  assert.equal(s.writes(), 0);
});
