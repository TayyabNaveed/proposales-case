// Live identity evaluation: one bounded report call per case and repetition
// (--repeat N, default 1); model output varies, so report the spread. Synthetic results go to
// evals/results; real-business cases and results stay in ignored private/.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadLocalEnv, safeFailure } from "./env.js";
import { identityCases, type IdentityCase } from "../evals/identity/cases.js";
import { evaluateIdentity } from "../evals/identity.js";
import {
  generateResearchReport,
  ResearchReportFailure,
} from "../src/server/providers/research.js";
import { activePrompts } from "../src/prompts/active.js";
try {
  loadLocalEnv();
  const privateFile = "private/identity-cases.json";
  const sets: [string, IdentityCase[], string][] = [
    ["synthetic", identityCases, "evals/results"],
    ...(fs.existsSync(privateFile)
      ? [["real", JSON.parse(fs.readFileSync(privateFile, "utf8")), "private"] as [string, IdentityCase[], string]]
      : []),
  ];
  const version = activePrompts.research.version;
  const flag = process.argv.indexOf("--repeat"),
    repeat = flag > 0 ? Math.min(5, Math.max(1, Number(process.argv[flag + 1]) || 1)) : 1;
  for (const [name, cases, dir] of sets) {
    const results = [];
    for (let run = 1; run <= repeat; run++)
    for (const c of cases) {
      let report = null,
        check: string | undefined,
        usage = null;
      try {
        const out = await generateResearchReport(c.input, c.evidence, "live-" + randomUUID());
        report = out.report;
        usage = out.usage;
      } catch (e) {
        if (!(e instanceof ResearchReportFailure)) throw e;
        check = e.diagnostics.check ?? e.diagnostics.failure;
        usage = e.diagnostics.usage;
      }
      const scored = evaluateIdentity(c, report);
      const identity = (report as any)?.identity;
      results.push({ run, ...scored, check, usage, reason: identity?.reason, rejected: identity?.rejected });
      console.log(
        name.padEnd(9),
        "#" + run,
        (scored.statusMatches ? "ok  " : "MISS") + (scored.sourcesMatch === false ? " sources-MISS" : ""),
        c.id.padEnd(58),
        scored.expected + " → " + scored.status + (check ? " (" + check + ")" : "") +
          (identity?.rejected?.length ? " rejected:" + identity.rejected.join(",") : ""),
      );
    }
    const summary = {
      promptVersion: version,
      validationVersion: activePrompts.research.validationVersion,
      model: process.env.DEEPSEEK_MODEL,
      ranAt: new Date().toISOString(),
      cases: cases.length,
      repetitions: repeat,
      runs: results.length,
      statusMatches: results.filter((r) => r.statusMatches).length,
      sourceChecks: results.filter((r) => r.sourcesMatch !== null).length,
      sourceMatches: results.filter((r) => r.sourcesMatch === true).length,
      failedReports: results.filter((r) => r.status === "failed").length,
    };
    console.log(name, JSON.stringify(summary));
    fs.writeFileSync(`${dir}/identity-${name}-${version}.json`, JSON.stringify({ summary, results }, null, 1) + "\n");
  }
} catch (e) {
  safeFailure(e);
}
