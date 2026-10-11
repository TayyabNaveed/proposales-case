import { z } from "zod";
import { agencyProfile } from "./agency.js";
import type { DraftSnapshot } from "./offers.js";
// The introduction's model contract: sentences, each with the references it
// relies on. Code keeps only sentences whose references all exist.
export const introOutputSchema = z
  .object({
    sentences: z
      .array(
        z
          .object({
            // Generous bounds: a long sentence is the operator's to edit, not a
            // reason to lose the whole introduction.
            text: z.string().min(1).max(800),
            refs: z.array(z.string().min(1).max(60)).min(1).max(8),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type IntroOutput = z.infer<typeof introOutputSchema>;

type Scope = Pick<DraftSnapshot, "report" | "items">;
// Only verified material reaches the model: the report's findings (already
// checked against sources), the client's stated goals, and the chosen scope.
export function introInput(snapshot: Scope) {
  const r = snapshot.report;
  return {
    agency: agencyProfile,
    business: { name: r.businessName, summary: r.summary },
    followUp: r.goals.length > 0,
    goals: r.goals.map((g) => g.text),
    findings: r.findings
      .filter((f) => f.kind !== "unknown")
      .map(({ id, kind, claim }) => ({ id, kind, claim })),
    services: snapshot.items.map((i) => ({
      ref: "service:" + i.serviceId,
      title: i.title,
      disposition: i.disposition,
      billing: i.billing,
    })),
  };
}
export type IntroInput = ReturnType<typeof introInput>;

export function keepSupported(output: IntroOutput, input: IntroInput) {
  const allowed = new Set([
    "agency",
    ...input.findings.map((f) => f.id),
    ...input.services.map((s) => s.ref),
    ...(input.followUp ? ["notes"] : []),
  ]);
  const kept: IntroOutput["sentences"] = [];
  let length = 0;
  for (const sentence of output.sentences.filter((s) =>
    s.refs.every((r) => allowed.has(r)),
  )) {
    const size = sentence.text.trim().length + (kept.length ? 1 : 0);
    if (kept.length === 5 || length + size > 1500) break;
    kept.push(sentence);
    length += size;
  }
  return {
    text: kept.map((s) => s.text.trim()).join(" "),
    sentences: kept,
    dropped: output.sentences.length - kept.length,
  };
}
