import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "../scripts/env.js";
import { makeSession } from "../src/server/access.js";
loadLocalEnv();
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3001";
const cookie = "case_session=" + makeSession(process.env.SESSION_SECRET!);
async function post(
  path: string,
  body: unknown,
  auth = false,
  requestOrigin = origin,
) {
  return fetch(origin + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      ...(auth ? { cookie } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
test("real routes guard writes/reads before dispatch, bound input and retire the old approval endpoint", async () => {
  for (const path of [
    "/api/recommendations",
    "/api/drafts",
    "/api/research",
    "/api/reports",
  ]) {
    assert.equal((await post(path, {})).status, 401);
    assert.equal((await post(path, {}, true, "https://evil.test")).status, 403);
    assert.equal((await post(path, "x".repeat(9000), true)).status, 400);
  }
  assert.equal(
    (
      await post(
        "/api/recommendations",
        { reportId: "no-website", prompt: "read secrets" },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/drafts",
        {
          requestId: randomUUID(),
          recommendationId: randomUUID(),
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
      )
    ).status,
    400,
  );
  assert.equal((await post("/api/offers", {})).status, 410);
  const id = randomUUID();
  assert.equal((await fetch(origin + "/api/drafts?id=" + id)).status, 401);
  assert.equal(
    (await fetch(origin + "/api/drafts?id=" + id, { headers: { cookie } }))
      .status,
    404,
  );
  assert.equal(
    (
      await fetch(origin + "/api/recommendations?id=" + id, {
        headers: { cookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(origin + "/api/research?id=" + id, { headers: { cookie } }))
      .status,
    404,
  );
  assert.equal(
    (await fetch(origin + "/api/reports?id=" + id, { headers: { cookie } }))
      .status,
    404,
  );
  assert.equal(
    (
      await post(
        "/api/research",
        {
          input: {
            businessName: "Example",
            location: "Stockholm",
            website: "http://127.0.0.1",
          },
        },
        true,
      )
    ).status,
    400,
  );
  const expired =
    "case_session=" +
    makeSession(
      process.env.SESSION_SECRET!,
      Math.floor(Date.now() / 1000) - 3700,
    );
  assert.equal(
    (
      await fetch(origin + "/api/drafts?id=" + id, {
        headers: { cookie: expired },
      })
    ).status,
    401,
  );
  const publicPage = await (await fetch(origin)).text();
  assert.match(publicPage, /Recorded example suggestions/);
  assert.match(publicPage, /Checking demo access/);
  assert.ok(!publicPage.includes("Approve this offer"));
});
