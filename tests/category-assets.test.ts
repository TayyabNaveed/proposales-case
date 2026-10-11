import { test } from "node:test";
import assert from "node:assert/strict";
import { categorySnapshot } from "./category-fixtures.js";
import {
  categoryManifest,
  seedCategory,
  loadCompositionAssets,
  proposalComposition,
} from "../src/server/category-assets.js";
import type { AssetStore, AssetRecord } from "../src/server/provider-assets.js";
function memory(): AssetStore {
  const rows = new Map<string, AssetRecord>();
  return {
    async claim(key, hash) {
      const r = rows.get(key);
      if (r) return r.hash === hash ? "existing" : "conflict";
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
      const r = rows.get(key);
      if (!r) throw Error("asset_missing");
      return structuredClone(r);
    },
    async record(key, ids) {
      Object.assign(rows.get(key)!, ids ?? {}, {
        state: ids ? "confirmed" : "unknown",
      });
    },
    async verifyImage(key, imageUuid) {
      rows.get(key)!.imageUuid = imageUuid;
    },
  };
}
test("manifest has exactly five category imports with stable versioned identities and no service mutations", () => {
  const m = categoryManifest("https://proposales-case.vercel.app");
  assert.equal(m.length, 5);
  assert.equal(new Set(m.map((i) => i.title)).size, 5);
  assert.ok(
    m.every((i) =>
      i.imageUrl.startsWith(
        "https://proposales-case.vercel.app/proposal-artwork/v1/",
      ),
    ),
  );
  assert.ok(m.every((i) => /^[a-f0-9]{64}$/.test(i.imageSha256)));
  assert.throws(() => categoryManifest("https://unrelated.example"));
  assert.throws(() => categoryManifest("http://127.0.0.1:3001"));
  assert.equal(proposalComposition(undefined), "proposal-3");
  assert.equal(proposalComposition("proposal-4"), "proposal-4");
  assert.throws(() => proposalComposition("random"));
});
test("category seeding verifies content, reuses admission and never retries an uncertain write", async () => {
  const store = memory(),
    manifest = categoryManifest("https://proposales-case.vercel.app")[0];
  let creates = 0;
  const detail = {
    productId: 100,
    variationId: 200,
    title: manifest.title,
    description: manifest.description,
    imageUuids: ["00000000-0000-4000-8000-000000000001"],
  };
  const api = {
    async createContent() {
      creates++;
      return { productId: 100, variationId: 200 };
    },
    async getContent() {
      return detail;
    },
    async listContent() {
      return [detail];
    },
  };
  const opts = {
    companyId: "1",
    categoryId: manifest.categoryId,
    origin: "https://proposales-case.vercel.app",
    store,
    api,
  };
  assert.equal((await seedCategory(opts)).imageUuid, detail.imageUuids[0]);
  await seedCategory(opts);
  assert.equal(creates, 1);
  const unknown = memory();
  const broken = {
    ...api,
    async createContent() {
      creates++;
      throw Error("response lost");
    },
    async listContent() {
      return [];
    },
  };
  await seedCategory({ ...opts, store: unknown, api: broken });
  await seedCategory({ ...opts, store: unknown, api: broken });
  assert.equal(creates, 2);
  const result = await seedCategory({ ...opts, store: unknown, api });
  assert.equal(result.state, "confirmed");
  assert.equal(creates, 2);
});
test("new snapshots require all category assets verified and preserve pins after asset-store changes", async () => {
  const s = categorySnapshot();
  const store = memory();
  await assert.rejects(loadCompositionAssets(store, "1", s));
  for (const c of categoryManifest("https://proposales-case.vercel.app")) {
    const n = categoryManifest("https://proposales-case.vercel.app").findIndex(
      (x) => x.categoryId === c.categoryId,
    );
    const detail = {
      productId: 100 + n,
      variationId: 200 + n,
      title: c.title,
      description: c.description,
      imageUuids: [s.compositionAssets!.categories[n].imageUuid],
    };
    await seedCategory({
      companyId: "1",
      categoryId: c.categoryId,
      origin: "https://proposales-case.vercel.app",
      store,
      api: {
        async createContent() {
          return detail;
        },
        async getContent() {
          return detail;
        },
        async listContent() {
          return [detail];
        },
      },
    });
  }
  for (const m of s.compositionAssets!.services) {
    const key = `company:1:catalogue:${s.catalogueVersion}:service:${m.serviceId}`;
    await store.claim(key, "test");
    await store.record(key, m);
    await store.verifyImage(key, m.imageUuid);
  }
  const pins = await loadCompositionAssets(store, "1", s);
  assert.deepEqual(pins, s.compositionAssets);
  await store.verifyImage(
    "company:1:categories:categories-1:category:website-experience",
    "00000000-0000-4000-8000-000000000099",
  );
  assert.notEqual(
    (await loadCompositionAssets(store, "1", s)).categories[0].imageUuid,
    pins.categories[0].imageUuid,
  );
});
