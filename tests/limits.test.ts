import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyLimit } from "../src/server/limits.js";

test("daily caps are opt-in: none by default, a number when configured", () => {
  for (const action of ["search", "identify", "report", "recommendation", "draft"] as const)
    assert.equal(dailyLimit(action, {}), null);
  assert.equal(dailyLimit("search", { DAILY_LIMIT_SEARCH: "5" }), 5);
  assert.equal(dailyLimit("search", { DAILY_LIMIT_SEARCH: "" }), null);
});

test("an invalid cap fails closed instead of silently removing it", () => {
  for (const value of ["0", "-1", "ten", "1.5", "100001", "off"])
    assert.throws(() => dailyLimit("report", { DAILY_LIMIT_REPORT: value }), /limit_configuration_invalid/);
});
