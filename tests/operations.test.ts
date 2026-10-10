import { test } from "node:test";
import assert from "node:assert/strict";
import { executeDraft } from "../src/server/operations.js";
const uuid = "12345678-1234-4234-8234-123456789012";
function memory() {
  let row: any;
  return {
    async claim(key: string, hash: string) {
      if (row) return row.hash === hash ? "existing" : "conflict";
      row = { key, hash, state: "claimed", providerId: null };
      return "claimed";
    },
    async get() {
      return row;
    },
    async record(_key: string, outcome: any) {
      row = { ...row, ...outcome };
    },
  };
}
test("repeat and concurrent creation call provider once and reuse result", async () => {
  const store = memory();
  let writes = 0;
  const run = () =>
    executeDraft({
      key: "company7:offer1:v1",
      hash: "hash1",
      store,
      create: async () => {
        writes++;
        return { uuid };
      },
    });
  await Promise.all([run(), run()]);
  const result = await run();
  assert.equal(writes, 1);
  assert.equal(result.state, "confirmed");
  assert.equal(result.providerId, uuid);
});
test("changed payload cannot reuse a claimed operation key", async () => {
  const store = memory();
  await store.claim("op", "hash1");
  let writes = 0;
  await assert.rejects(
    () =>
      executeDraft({
        key: "op",
        hash: "hash2",
        store,
        create: async () => {
          writes++;
          return { uuid };
        },
      }),
    /payload_conflict/,
  );
  assert.equal(writes, 0);
});
test("lost provider response persists unknown and never repeats creation", async () => {
  const store = memory();
  let writes = 0;
  const run = () =>
    executeDraft({
      key: "op",
      hash: "h",
      store,
      create: async () => {
        writes++;
        throw new Error("timeout");
      },
    });
  assert.equal((await run()).state, "unknown");
  assert.equal((await run()).state, "unknown");
  assert.equal(writes, 1);
});
test("provider success followed by persistence failure never allows another write", async () => {
  const store = memory();
  let writes = 0;
  const original = store.record;
  store.record = async (key, outcome) => {
    if (outcome.state === "confirmed") throw new Error("database down");
    return original(key, outcome);
  };
  const run = () =>
    executeDraft({
      key: "op",
      hash: "h",
      store,
      create: async () => {
        writes++;
        return { uuid };
      },
    });
  assert.equal((await run()).state, "unknown");
  await run();
  assert.equal(writes, 1);
});
test("confirmation committed but acknowledgement lost recovers confirmed result", async () => {
  const store = memory();
  const original = store.record;
  let writes = 0;
  store.record = async (key, outcome) => {
    if (
      outcome.state === "unknown" &&
      (await store.get()).state === "confirmed"
    )
      throw new Error("transition conflict");
    await original(key, outcome);
    if (outcome.state === "confirmed") throw new Error("ack lost");
  };
  const result = await executeDraft({
    key: "op",
    hash: "h",
    store,
    create: async () => {
      writes++;
      return { uuid };
    },
  });
  assert.equal(result.state, "confirmed");
  assert.equal(result.providerId, uuid);
  assert.equal(writes, 1);
});
test("evidence-file failure happens after identity persistence and cannot permit another write", async () => {
  const store = memory();
  let writes = 0,
    evidenceAttempts = 0;
  const run = () =>
    executeDraft({
      key: "op-evidence",
      hash: "hash",
      store,
      create: async () => {
        writes++;
        return { uuid };
      },
      afterConfirmed: async () => {
        evidenceAttempts++;
        assert.equal((await store.get()).providerId, uuid);
        throw new Error("disk failure");
      },
    });
  const result = await run();
  assert.equal(evidenceAttempts, 1);
  assert.equal(result.providerId, uuid);
  assert.equal(result.state, "confirmed");
  await run();
  assert.equal(writes, 1);
});
test("provider-returned editor URL persists with identity and survives repeat requests", async () => {
  const store = memory();
  let writes = 0;
  const url = "https://secure.proposales.com/proposals/" + uuid + "/edit";
  const run = () =>
    executeDraft({
      key: "url",
      hash: "h",
      store,
      create: async () => {
        writes++;
        return { uuid, url };
      },
    });
  const result = await run();
  assert.equal(result.editorUrl, url);
  assert.equal((await run()).editorUrl, url);
  assert.equal(writes, 1);
});
test("unsafe provider URL is discarded while the successful UUID remains durable", async () => {
  const store = memory();
  const result = await executeDraft({
    key: "url",
    hash: "h",
    store,
    create: async () => ({ uuid, url: "https://evil.test/" + uuid }),
  });
  assert.equal(result.state, "confirmed");
  assert.equal(result.providerId, uuid);
  assert.ok(!result.editorUrl);
});
