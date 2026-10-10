import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedService,
  type AssetStore,
  type AssetRecord,
} from "../src/server/provider-assets.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
const image = "https://metascalers.com/brand.jpg";
function memory(): AssetStore {
  const rows = new Map<string, AssetRecord>();
  return {
    async claim(key, hash) {
      const row = rows.get(key);
      if (row) return row.hash === hash ? "existing" : "conflict";
      rows.set(key, {
        state: "claimed",
        hash,
        productId: null,
        variationId: null,
        imageUuid: null,
      });
      return "claimed";
    },
    async get(key) {
      return structuredClone(rows.get(key)!);
    },
    async record(key, ids) {
      const row = rows.get(key)!;
      Object.assign(
        row,
        ids ? { state: "confirmed", ...ids } : { state: "unknown" },
      );
    },
    async verifyImage(key, imageUuid) {
      rows.get(key)!.imageUuid = imageUuid;
    },
  };
}
const content = (productId = 10, variationId = 20) => ({
  productId,
  variationId,
  title: "",
  description: "",
  imageUuids: ["00000000-0000-4000-8000-000000000001"],
});
test("seed admission allows one creation and stores separate product and variation IDs", async () => {
  const store = memory();
  let count = 0;
  let title = "",
    description = "";
  const api = {
    async createContent(i: any) {
      count++;
      title = i.title;
      description = i.description;
      return { productId: 10, variationId: 20 };
    },
    async getContent() {
      return { ...content(), title, description };
    },
    async listContent() {
      return [];
    },
  };
  const opts = {
    companyId: "1",
    serviceId: "website-base",
    catalogue: catalogueV2,
    imageUrl: image,
    store,
    api,
  };
  const results = await Promise.all([seedService(opts), seedService(opts)]);
  assert.equal(count, 1);
  const result = await seedService(opts);
  assert.equal(result.state, "confirmed");
  assert.equal(result.productId, 10);
  assert.equal(result.variationId, 20);
  assert.ok(result.imageUuid);
  assert.ok(results.some((r) => r.state === "confirmed"));
});
test("lost create response never causes automatic reseeding", async () => {
  let count = 0;
  const opts = {
    companyId: "1",
    serviceId: "website-base",
    catalogue: catalogueV2,
    imageUrl: image,
    store: memory(),
    api: {
      async createContent() {
        count++;
        throw new Error("timeout");
      },
      async getContent() {
        throw new Error("not called");
      },
      async listContent() {
        return [];
      },
    },
  };
  assert.equal((await seedService(opts)).state, "unknown");
  assert.equal((await seedService(opts)).state, "unknown");
  assert.equal(count, 1);
});
test("known creation survives failed detail read without another create", async () => {
  let count = 0;
  const opts = {
    companyId: "1",
    serviceId: "website-base",
    catalogue: catalogueV2,
    imageUrl: image,
    store: memory(),
    api: {
      async createContent() {
        count++;
        return { productId: 10, variationId: 20 };
      },
      async getContent() {
        throw new Error("read failed");
      },
      async listContent() {
        return [];
      },
    },
  };
  const a = await seedService(opts);
  assert.equal(a.state, "confirmed");
  assert.equal(a.imageUuid, null);
  assert.equal((await seedService(opts)).variationId, 20);
  assert.equal(count, 1);
});
test("invalid account, private image URLs and unknown services never dispatch", async () => {
  let count = 0;
  const base = {
    companyId: "1",
    serviceId: "website-base",
    catalogue: catalogueV2,
    imageUrl: image,
    store: memory(),
    api: {
      async createContent() {
        count++;
        return { productId: 10, variationId: 20 };
      },
      async getContent() {
        return content();
      },
      async listContent() {
        return [];
      },
    },
  };
  for (const input of [
    { ...base, companyId: "bad" },
    { ...base, serviceId: "fake" },
    ...[
      "http://metascalers.com/a",
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://user:pass@metascalers.com/a",
    ].map((imageUrl) => ({ ...base, imageUrl })),
  ])
    await assert.rejects(() => seedService(input));
  assert.equal(count, 0);
});
