import fs from "node:fs";
import { loadLocalEnv, safeFailure } from "./env.js";
import { createDatabase } from "../src/server/db.js";
import {
  createRecommendationStore,
  createRecommendationService,
} from "../src/server/recommendations.js";
import { fixtures } from "../evals/fixtures/index.js";
import { evaluateSelection } from "../evals/service-selection.js";
import {
  recommendationIdentity,
  type RecommendationRun,
} from "../src/server/providers/recommendations.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
const resultPath = "evals/results/service-selection.json";
type Row = {
  id: string;
  split: string;
  recordedAt: string;
  inputHash: string;
  run: RecommendationRun | null;
  errorCode: string | null;
  checks: ReturnType<typeof evaluateSelection> | null;
};
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  const flags = process.argv.slice(2);
  if (
    flags.some((f) => !["--run", "--refresh"].includes(f)) ||
    (flags.includes("--refresh") && !flags.includes("--run"))
  )
    throw new Error("invalid_flags");
  let rows: Row[] = fs.existsSync(resultPath)
    ? JSON.parse(fs.readFileSync(resultPath, "utf8")).rows
    : [];
  if (flags.includes("--run")) {
    loadLocalEnv();
    const model = process.env.DEEPSEEK_MODEL;
    if (!model || !process.env.DEEPSEEK_API_KEY)
      throw new Error("model_configuration_missing");
    pool = createDatabase();
    const service = createRecommendationService(
      createRecommendationStore(pool),
      { model, reports: fixtures.map((f) => f.report) },
    );
    // Operator-only, explicit bounded batch: 12 admissions, at most 24 HTTP attempts. No tools or provider writes.
    for (const fixture of fixtures) {
      const identity = recommendationIdentity(
        fixture.report,
        catalogueV2,
        "operator-evaluation",
        model,
      );
      const saved = rows.find(
        (r) => r.id === fixture.id && r.inputHash === identity.inputHash,
      );
      if (saved && !flags.includes("--refresh")) {
        console.log(
          JSON.stringify({ fixture: fixture.id, reusedRecorded: true }),
        );
        continue;
      }
      const record = await service.getOrCreateRecommendation(
        fixture.id,
        "operator-evaluation",
        flags.includes("--refresh"),
      );
      if (record.state === "running")
        throw new Error("recommendation_in_progress");
      const row: Row = {
        id: fixture.id,
        split: fixture.split,
        recordedAt: new Date().toISOString(),
        inputHash: identity.inputHash,
        run: record.result,
        errorCode: record.errorCode,
        checks: record.result
          ? evaluateSelection(fixture, record.result.selection)
          : null,
      };
      rows = rows.filter((r) => r.id !== fixture.id);
      rows.push(row);
      fs.mkdirSync("evals/results", { recursive: true });
      fs.writeFileSync(
        resultPath,
        JSON.stringify(
          {
            label:
              "Recorded AI outputs from synthetic reports; not live research. Label checks do not prove semantic accuracy.",
            rows,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        JSON.stringify({
          fixture: fixture.id,
          state: record.state,
          attempts: record.result?.attempts ?? record.diagnostics?.attempts,
          invariants: row.checks?.invariants,
          labelledFit: row.checks?.labelledFit,
        }),
      );
    }
    const primary = rows.filter(
      (r) => ["no-website", "enquiry-flow"].includes(r.id) && r.run,
    );
    fs.writeFileSync(
      "src/domain/recorded-recommendations.json",
      JSON.stringify(
        {
          label: "Recorded AI recommendations on synthetic examples",
          recommendations: primary.map(({ id, recordedAt, run }) => ({
            reportId: id,
            recordedAt,
            ...run,
          })),
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    JSON.stringify({
      recorded: rows.length,
      ready: rows.filter((r) => r.run).length,
      invariantsPassed: rows.filter((r) => r.checks?.invariants).length,
      labelledFitPassed: rows.filter((r) => r.checks?.labelledFit).length,
      humanSemanticReview: "separate; see evaluation notes",
    }),
  );
} catch (error) {
  safeFailure(error);
} finally {
  await pool?.end();
}
