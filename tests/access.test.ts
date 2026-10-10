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
