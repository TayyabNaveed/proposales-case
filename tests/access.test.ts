import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeSession,
  readSession,
  checkOrigin,
  checkCode,
} from "../src/server/access.js";
test("signed sessions expire and reject tampering", () => {
  const s = makeSession("secret", 1000);
  assert.equal(readSession(s, "secret", 1001), "reviewer");
  assert.equal(readSession(s + "x", "secret", 1001), null);
  assert.equal(readSession(s, "wrong", 1001), null);
  assert.equal(readSession(s, "secret", 4600), null);
});
test("write origin must match request origin", () => {
  assert.equal(
    checkOrigin("http://localhost:3000", "http://localhost:3000/api"),
    true,
  );
  assert.equal(checkOrigin(null, "http://localhost:3000/api"), false);
  assert.equal(
    checkOrigin("https://evil.test", "http://localhost:3000/api"),
    false,
  );
});
test("credentials must be configured and exact", () => {
  assert.equal(checkCode("a", "a"), true);
  assert.equal(checkCode("a", "b"), false);
  assert.equal(checkCode("", ""), false);
});

test("session cookies require HTTPS except for explicit local development origins", async () => {
  const { sessionCookieSecure } = await import("../src/server/access.js");
  assert.equal(sessionCookieSecure("http://127.0.0.1:3001"), false);
  assert.equal(sessionCookieSecure("http://localhost:3001"), false);
  assert.equal(sessionCookieSecure("https://case.example.com"), true);
  assert.throws(() => sessionCookieSecure("http://case.example.com"));
  assert.throws(() => sessionCookieSecure(undefined));
});
test("login limits use a hashed per-visitor bucket only behind Vercel, with a global backstop", async () => {
  const { loginBuckets } = await import("../src/server/access.js");
  const req = (h: Record<string, string>) =>
    new Request("https://case.example/api/session", { headers: h });
  const local = loginBuckets(req({ "x-forwarded-for": "203.0.113.9" }), "s", {});
  assert.equal(local.length, 1);
  assert.equal(local[0].limit, 5);
  const vercel = { VERCEL: "1" };
  const a = loginBuckets(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), "s", vercel);
  const b = loginBuckets(req({ "x-forwarded-for": "198.51.100.4" }), "s", vercel);
  assert.deepEqual(a.map((x) => x.limit), [5, 30]);
  assert.notEqual(a[0].bucket, b[0].bucket);
  assert.equal(a[1].bucket, b[1].bucket);
  assert.ok(!a[0].bucket.includes("203.0.113.9"));
  assert.equal(loginBuckets(req({}), "s", vercel).length, 1);
});

test("a visitor over its own login limit never consumes the global cap", async () => {
  const { admitLogin } = await import("../src/server/access.js");
  const counts = new Map<string, number>();
  const consume = async (bucket: string, limit: number) => {
    const n = (counts.get(bucket) ?? 0) + 1;
    counts.set(bucket, n);
    return n <= limit;
  };
  const buckets = [
    { bucket: "visitor", limit: 5 },
    { bucket: "global", limit: 30 },
  ];
  // One source sends 100 attempts: only the first 5 reach the global bucket.
  for (let i = 0; i < 100; i++) await admitLogin(buckets, consume);
  assert.equal(counts.get("global"), 5);
  // Another visitor still gets in.
  assert.equal(
    await admitLogin([{ bucket: "other", limit: 5 }, buckets[1]], consume),
    true,
  );
});
