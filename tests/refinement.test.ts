import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reports } from "../src/domain/reports.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import {
  buildPricedPayload,
  verifyPricedProposal,
} from "../src/server/providers/proposales-mapping.js";
import { recordedFor } from "../src/domain/workbench.js";
const base = () =>
  buildDraftSnapshot(
    reports[0],
    recordedFor(reports[0].id).selection,
    catalogueV2,
  );
const mappings = () =>
  base().items.map((i, n) => ({
    serviceId: i.serviceId,
    productId: n + 10,
    variationId: n + 20,
    imageUuid: "00000000-0000-4000-8000-000000000001",
  }));
test("presentation puts core foundations before additions, monthly after work and optional last without mutating identity", async () => {
  const { presentServices } = await import("../src/domain/presentation.js");
  const items = base().items;
  const before = JSON.stringify(items);
  const sorted = presentServices(items, catalogueV2);
  assert.equal(sorted[0].serviceId, "website-base");
  assert.equal(JSON.stringify(items), before);
  const picks = [
    { serviceId: "ads-management", disposition: "core" as const },
    { serviceId: "ads-setup", disposition: "core" as const },
    { serviceId: "faq-content", disposition: "optional" as const },
    { serviceId: "social-management", disposition: "core" as const },
  ];
  assert.deepEqual(
    presentServices(picks, catalogueV2).map((i) => i.serviceId),
    ["ads-setup", "ads-management", "social-management", "faq-content"],
  );
  assert.deepEqual(
    presentServices(
      [{ serviceId: "social-management", disposition: "core" as const }],
      catalogueV2,
    ).map((i) => i.serviceId),
    ["social-management"],
  );
});
test("legacy provider payload remains alphabetic; proposal-2 pins order, library images and truthful mode", () => {
  const old = base();
  const legacy = buildPricedPayload(old, mappings(), "1", "op");
  assert.deepEqual(
    legacy.blocks.map((b) => b.content_id),
    mappings().map((m) => m.variationId),
  );
  assert.ok(legacy.blocks.every((b) => b.image_uuids.length === 1));
  const newer = { ...old, compositionVersion: "proposal-2" as const };
  const p = buildPricedPayload(newer, mappings(), "1", "op");
  assert.equal(p.blocks[0].title, "Website foundation");
  // Proposales replaces an empty image list with the library item's image, so
  // proposal-2 sends that image explicitly and fidelity stays exact.
  assert.ok(p.blocks.every((b) => b.image_uuids.length === 1));
  assert.equal(p.data.case_composition, "proposal-2");
  const actual = {
    ...p,
    uuid: "00000000-0000-4000-8000-000000000002",
    status: null,
    recipient_is_set: false,
    currency: "EUR",
  };
  assert.equal(
    verifyPricedProposal(actual, newer, mappings(), "1", "op").verified,
    true,
  );
  actual.blocks.reverse();
  assert.equal(
    verifyPricedProposal(actual, newer, mappings(), "1", "op").verified,
    false,
  );
  const live = {
    ...newer,
    report: {
      ...newer.report,
      mode: "live" as const,
      evidence: newer.report.evidence.map((e) => ({
        ...e,
        synthetic: false,
        retrievedAt: "2026-10-10T12:00:00.000Z",
      })),
    },
  };
  assert.ok(
    !buildPricedPayload(live, mappings(), "1", "op").description_md.includes(
      "Synthetic",
    ),
  );
  assert.throws(
    () =>
      buildPricedPayload(
        { ...newer, compositionVersion: "unknown" } as any,
        mappings(),
        "1",
        "op",
      ),
    /composition/,
  );
});
test("canonical extraction preserves bytes, arrays and legacy exports", async () => {
  const current = await import("../src/server/canonical.js");
  const old = await import("../src/server/offers.js");
  const value = { z: [{ b: 2, a: 1 }, null], a: "value" };
  assert.equal(
    current.canonicalJSON(value),
    '{"a":"value","z":[{"a":1,"b":2},null]}',
  );
  assert.equal(current.snapshotHash(value), old.snapshotHash(value));
  assert.notEqual(current.snapshotHash([1, 2]), current.snapshotHash([2, 1]));
});
test("extracted active prompts preserve exact shipped text and record operational/template provenance", async () => {
  const { activePrompts } = await import("../src/prompts/active.js");
  const { definition: researchV2 } =
    await import("../src/prompts/research-report/v2.js");
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  // research-report-2 stays byte-identical for replay; research-report-3 is active.
  assert.equal(activePrompts.research.version, "research-report-3");
  assert.match(activePrompts.research.system, /unverified|older listing/i);
  assert.equal(
    hash(researchV2.system),
    "aa80bde27622f20ab4b0e61c80e2670596a022a8fa8f37fd8492c5076a84fe9d",
  );
  assert.equal(
    hash(activePrompts.selection.system),
    "7f009789a924bc8553b11c71d7c70993fad1d6f4fc5fa6109e444fa7cd503c2f",
  );
  const { promptProvenance } =
    await import("../src/server/prompt-provenance.js");
  const a = promptProvenance(activePrompts.selection),
    b = promptProvenance({
      ...activePrompts.selection,
      config: { ...activePrompts.selection.config, maxOutputTokens: 1700 },
    });
  assert.notEqual(a.configHash, b.configHash);
  assert.equal(a.templateHash, b.templateHash);
});

test("admitted snapshot recovers after recommendation expiry without rebuilding and rejects changed payload", async () => {
  const { createDraftService } = await import("../src/server/drafts.js");
  const snap = base(),
    requestId = "00000000-0000-4000-8000-000000000001",
    recId = "00000000-0000-4000-8000-000000000002";
  const { snapshotHash } = await import("../src/server/canonical.js");
  const stored = {
    id: "00000000-0000-4000-8000-000000000003",
    requestId,
    recommendationId: recId,
    accessScope: "test",
    snapshot: snap,
    snapshotHash: snapshotHash(snap),
    createdAt: new Date(),
  };
  let reads = 0;
  const pool = {
    query: async (sql: string) => {
      assert.ok(
        sql.includes("draft_snapshots"),
        "must recover before reading stale recommendations",
      );
      reads++;
      return { rowCount: 1, rows: [stored] };
    },
  } as any;
  const service = createDraftService(pool, { model: "model" });
  const picks = snap.items.map(({ serviceId, quantity, disposition }) => ({
    serviceId,
    quantity,
    disposition,
  }));
  assert.equal(
    (
      await service.getOrCreateDraftSnapshot(
        requestId,
        recId,
        [...picks].reverse(),
        "test",
      )
    ).id,
    stored.id,
  );
  await assert.rejects(
    service.getOrCreateDraftSnapshot(requestId, recId, picks.slice(1), "test"),
    /draft_request_conflict/,
  );
  assert.equal(reads, 2);
});
test("research report failures retain safe usage/provenance without leaking raw provider errors", async () => {
  const { generateResearchReport } =
    await import("../src/server/providers/research.js");
  const input = {
    businessName: "Juniper",
    location: "Stockholm",
    website: undefined,
  };
  const evidence = [
    {
      id: "s1",
      label: "Juniper",
      excerpt: "Juniper Stockholm pottery classes.",
      synthetic: false,
      url: "https://juniper.example/",
      retrievedAt: "2026-10-10T12:00:00.000Z",
    },
  ];
  const transport: typeof fetch = async () =>
    Response.json({
      id: "synthetic",
      object: "chat.completion",
      created: 1,
      model: "deepseek-flash",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              identityStatus: "confirmed",
              summary: "Juniper has no website.",
              findings: [],
              actions: [],
              uncertainties: [],
            }),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    });
  await assert.rejects(
    generateResearchReport(input, evidence, "live-test", {
      apiKey: "synthetic",
      model: "deepseek-flash",
      fetch: transport,
    }),
    (error: any) => {
      assert.equal(error.message, "research_report_failed");
      assert.equal(error.diagnostics.usage.inputTokens, 100);
      assert.equal(error.diagnostics.failure, "validation_failed");
      assert.ok(error.diagnostics.provenance.requestHash);
      return true;
    },
  );
  await assert.rejects(
    generateResearchReport(input, evidence, "live-test", {
      apiKey: "synthetic",
      model: "deepseek-flash",
      fetch: async () => {
        throw Error("PRIVATE_SECRET_RAW_BODY");
      },
    }),
    (error: any) => {
      assert.equal(JSON.stringify(error).includes("PRIVATE_SECRET"), false);
      assert.equal(error.diagnostics.usage.inputTokens, null);
      return true;
    },
  );
});
test("public research projects validated stage contracts and excludes storage/scope fields", async () => {
  const { publicResearch } = await import("../src/server/research.js");
  const raw = {
    id: "test",
    stage: "search",
    state: "failed",
    input: { businessName: "Juniper", location: "Stockholm" },
    result: null,
    errorCode: "research_search_failed",
    createdAt: "2026-10-10T12:00:00.000Z",
    expiresAt: null,
    cacheHit: false,
    accessScope: "private-scope",
    inputHash: "private-hash",
  } as any;
  const p = publicResearch(raw);
  assert.deepEqual(p.input, raw.input);
  assert.equal("accessScope" in p, false);
  assert.equal("inputHash" in p, false);
  assert.throws(() =>
    publicResearch({ ...raw, state: "ready", result: { evidence: "bad" } }),
  );
});
test("pending proposal recovery finds requests across tabs and rejects unreadable records", async () => {
  const { findSavedGeneration } = await import("../src/domain/workbench.js");
  const map = new Map([
    [
      "case-generation:enquiry-flow",
      JSON.stringify({
        requestId: "00000000-0000-4000-8000-000000000001",
        recommendationId: "00000000-0000-4000-8000-000000000002",
        selections: [
          {
            serviceId: "enquiry-improvement",
            quantity: 1,
            disposition: "core",
          },
        ],
      }),
    ],
  ]);
  const storage = {
    length: map.size,
    key: (n: number) => [...map.keys()][n] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
  };
  assert.equal(findSavedGeneration(storage)?.reportId, "enquiry-flow");
  map.set("case-generation:enquiry-flow", "bad");
  assert.throws(() => findSavedGeneration(storage));
});
test("atomic browser admission protects one pending identity across simultaneous browser windows", async () => {
  const { admitBrowserGeneration } = await import("../src/domain/workbench.js");
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (n: number) => [...map.keys()][n] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  let tail = Promise.resolve();
  const locks = {
    request: (_name: string, fn: () => Promise<void> | void) => {
      const run = tail.then(fn);
      tail = run.catch(() => {});
      return run;
    },
  };
  const a = {
      requestId: "00000000-0000-4000-8000-000000000001",
      recommendationId: "00000000-0000-4000-8000-000000000002",
      selections: [
        {
          serviceId: "website-base",
          quantity: 1,
          disposition: "core" as const,
        },
      ],
    },
    b = { ...a, requestId: "00000000-0000-4000-8000-000000000003" };
  const results = await Promise.allSettled([
    admitBrowserGeneration(storage, locks, "no-website", a),
    admitBrowserGeneration(storage, locks, "no-website", b),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    JSON.parse(map.get("case-generation:no-website")!).requestId,
    a.requestId,
  );
  await admitBrowserGeneration(storage, locks, "no-website", a);
  await assert.rejects(
    admitBrowserGeneration(storage, undefined, "no-website", b),
    /browser/,
  );
});
test("stalled recommendations allow deliberate restart only after the server window; pending report wins over normal restore", async () => {
  const { canRestartRecommendation, canAdoptReport } =
    await import("../src/domain/workbench.js");
  const now = Date.parse("2026-10-10T12:10:00Z");
  assert.equal(
    canRestartRecommendation(
      { state: "running", createdAt: "2026-10-10T12:09:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    canRestartRecommendation(
      { state: "running", createdAt: "2026-10-10T12:07:00Z" },
      now,
    ),
    true,
  );
  assert.equal(canRestartRecommendation({ state: "failed" }, now), true);
  assert.equal(canAdoptReport("live-A", "live-B"), false);
  assert.equal(canAdoptReport("live-A", "live-A"), true);
});
