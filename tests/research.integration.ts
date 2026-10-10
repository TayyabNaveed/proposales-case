import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { loadLocalEnv } from "../scripts/env.js";
import { createDatabase } from "../src/server/db.js";
loadLocalEnv();
test("research stages deduplicate concurrent admissions, isolate cache scope, retain failures and enforce daily limits", async () => {
  const { createResearchStore } = await import("../src/server/research.js");
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    a = createDatabase(),
    b = createDatabase();
  try {
    await a.query(`CREATE SCHEMA "${schema}"`);
    await a.query(
      fs
        .readFileSync("db/migrations/005_research.sql", "utf8")
        .replaceAll("case_workflow", schema),
    );
    const x = createResearchStore(a, schema, () => 10),
      y = createResearchStore(b, schema, () => 10);
    const args = {
      stage: "search" as const,
      identity: { query: "Juniper Stockholm", version: 1 },
      input: { businessName: "Juniper", location: "Stockholm" },
      scope: "a",
      refresh: false,
    };
    const [first, second] = await Promise.all([x.admit(args), y.admit(args)]);
    assert.equal(first.record.id, second.record.id);
    assert.equal([first, second].filter((r) => r.claimed).length, 1);
    const ready = await x.finish(first.record.id, "a", "ready", {
      evidence: [],
    });
    assert.equal(ready.state, "ready");
    assert.equal((await y.admit(args)).record.cacheHit, true);
    await assert.rejects(y.get(ready.id, "b"), /research_missing/);
    const different = await y.admit({ ...args, scope: "b" });
    assert.notEqual(different.record.id, ready.id);
    const fresh = await x.admit({ ...args, refresh: true });
    assert.notEqual(fresh.record.id, ready.id);
    await x.finish(
      fresh.record.id,
      "a",
      "partial",
      { evidence: [] },
      "research_search_partial",
    );
    const partial = await y.admit(args);
    assert.equal(partial.record.state, "partial");
    assert.equal(partial.record.cacheHit, false);
    assert.equal(partial.claimed, false);
    await a.query(
      `UPDATE "${schema}".research_runs SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [ready.id],
    );
    assert.equal((await x.get(ready.id, "a")).state, "ready");
    for (let n = 0; n < 8; n++) await x.admit({ ...args, identity: { n } });
    await assert.rejects(
      x.admit({ ...args, identity: { n: 99 } }),
      /research_budget_exceeded/,
    );
    const report = await x.admit({ ...args, stage: "report" });
    assert.equal(report.claimed, true);
    await x.finish(
      report.record.id,
      "a",
      "failed",
      null,
      "research_report_failed",
    );
    assert.equal((await y.admit({ ...args, stage: "report" })).claimed, false);
  } finally {
    await a.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await a.end();
    await b.end();
  }
});

test("live report cache reuses sources and recommendations, and scoped/expired reports cannot create snapshots", async () => {
  const { createResearchStore, createResearchService } =
    await import("../src/server/research.js");
  const { createRecommendationStore, createRecommendationService } =
    await import("../src/server/recommendations.js");
  const { createDraftService } = await import("../src/server/drafts.js");
  const schema = "case_test_" + randomBytes(8).toString("hex"),
    pool = createDatabase();
  let searchCalls = 0,
    reportCalls = 0;
  const output = {
    identity: {
      status: "confirmed",
      reason: "One listing names the studio in Stockholm.",
      candidates: [
        {
          sourceIds: ["s1"],
          name: { sourceId: "s1", text: "Juniper Ceramics" },
          location: { sourceId: "s1", text: "Stockholm" },
        },
      ],
    },
    summary: "A studio offers classes.",
    findings: [
      {
        id: "f1",
        section: "content",
        claim: "Juniper Ceramics Stockholm offers beginner pottery classes.",
        kind: "observed",
        evidenceIds: ["s1"],
      },
    ],
    actions: [],
    uncertainties: ["Confirm marketing goals."],
  };
  const response = (raw: unknown) =>
    Response.json({
      id: "synthetic",
      object: "chat.completion",
      created: 1,
      model: "deepseek-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(raw) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const m of ["003_recommendations_and_drafts", "005_research"])
      await pool.query(
        fs
          .readFileSync("db/migrations/" + m + ".sql", "utf8")
          .replaceAll("case_workflow", schema),
      );
    const service = createResearchService(createResearchStore(pool, schema, () => 10), {
      model: "deepseek-flash",
      apiKey: "synthetic",
      tavilyKey: "synthetic",
      searchFetch: async () => {
        searchCalls++;
        return Response.json({
          results: [
            {
              title: "Juniper Ceramics Stockholm",
              url: "https://juniper.example/",
              content:
                "Juniper Ceramics Stockholm offers beginner pottery classes.",
              score: 1,
            },
          ],
          usage: { credits: 1 },
        });
      },
      modelFetch: async () => {
        reportCalls++;
        return response(output);
      },
    });
    const searched = await service.search(
      {
        businessName: "Juniper Ceramics",
        location: "Stockholm",
        website: "https://juniper.example",
      },
      "a",
    );
    const built = await service.report(searched.id, "a");
    assert.equal(built.state, "ready");
    assert.equal((await service.report(searched.id, "a")).cacheHit, true);
    assert.equal(searchCalls, 3);
    assert.equal(reportCalls, 1);
    const { reportResultSchema } =
      await import("../src/domain/research-state.js");
    const reportId = reportResultSchema.parse(built.result).report.id;
    assert.equal((await service.resolveReport(reportId, "a")).mode, "live");
    await assert.rejects(
      service.resolveReport(reportId, "b"),
      /research_missing/,
    );
    const recommendations = createRecommendationService(
      createRecommendationStore(pool, schema),
      {
        model: "deepseek-flash",
        apiKey: "synthetic",
        resolveReport: service.resolveReport,
        fetch: async () =>
          response({
            items: [
              {
                serviceId: "faq-content",
                quantity: 1,
                disposition: "optional",
                findingIds: ["f1"],
                rationale:
                  "Clear class information may help prospective beginners.",
              },
            ],
            questions: ["Confirm whether FAQ content is needed."],
            abstentionReason: null,
          }),
      },
    );
    const r = await recommendations.getOrCreateRecommendation(
      reportId,
      "a",
      false,
    );
    assert.equal(r.state, "ready");
    assert.equal(
      (await recommendations.getOrCreateRecommendation(reportId, "a", false))
        .cacheHit,
      true,
    );
    assert.equal(searchCalls, 3);
    assert.equal(reportCalls, 1);
    const drafts = createDraftService(pool, {
      schema,
      model: "deepseek-flash",
      resolveReport: service.resolveReport,
    });
    const selections = r.result!.selection.items.map(
      ({ serviceId, quantity, disposition }) => ({
        serviceId,
        quantity,
        disposition,
      }),
    );
    const { randomUUID } = await import("node:crypto");
    const saved = await drafts.getOrCreateDraftSnapshot(
      randomUUID(),
      r.id,
      selections,
      "a",
    );
    assert.equal(saved.snapshot.optionalOneTimeMinor, 30000);
    await pool.query(
      `UPDATE "${schema}".research_runs SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [built.id],
    );
    await assert.rejects(
      drafts.getOrCreateDraftSnapshot(randomUUID(), r.id, selections, "a"),
      /research_stale/,
    );
    await assert.rejects(
      service.resolveReport(reportId, "a"),
      /research_stale/,
    );
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
