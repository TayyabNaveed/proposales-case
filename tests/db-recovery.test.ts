import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftStore } from "../src/server/drafts.js";
import { createRecommendationStore } from "../src/server/recommendations.js";
import { createResearchStore } from "../src/server/research.js";

test("failed transaction rollback destroys the client and preserves the original failure in every store", async () => {
  for (const rollbackFails of [false, true]) {
    for (const stage of ["draft", "resolve", "recommendation", "research"]) {
      const original = Error("original query failure");
      const releases: unknown[] = [];
      const client = {
        async query(sql: string) {
          if (sql === "ROLLBACK") {
            if (!rollbackFails) return {};
            throw Error("rollback failure");
          }
          throw original;
        },
        release(destroy?: boolean) {
          releases.push(destroy ?? false);
        },
      };
      const pool = {
        async connect() {
          return client;
        },
      } as any;
      const id = "00000000-0000-4000-8000-000000000001";
      const operation =
        stage === "draft"
          ? createDraftStore(pool).save(id, id, "scope", {} as any)
          : stage === "resolve"
            ? createDraftStore(pool).resolveRequest(id, id, "scope")
            : stage === "recommendation"
              ? createRecommendationStore(pool).admit(
                  {
                    accessScope: "scope",
                    identity: { inputHash: "hash" },
                  } as any,
                  false,
                )
              : createResearchStore(pool).admit({
                  scope: "scope",
                  stage: "search",
                  identity: {},
                  input: {},
                  refresh: false,
                });
      await assert.rejects(operation, (e) => e === original);
      assert.deepEqual(releases, [rollbackFails]);
    }
  }
});
