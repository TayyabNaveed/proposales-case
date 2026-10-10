# How this project is built

The product is built with an AI coding agent, and the engineer owns every decision. The workflow below exists so that each change is explainable, measured and reversible. The examples are from this repository's own history.

## The loop

1. **Observe.** Reproduce the problem from saved records or tests before discussing a fix. Every research, report and recommendation run is stored with its inputs, versions and outcome, so a failure seen in the browser can be read back exactly.
2. **Find the root cause.** Name the cause and its evidence. Several symptoms often share one cause; fixing them one by one produces patches.
3. **Specify.** Write the problem, decisions, data contracts, phases and acceptance criteria in `docs/specs/` before coding. A spec says what the AI does, what code verifies and what a person decides.
4. **Measure first.** Write failing tests (RED). For behaviour that depends on a model, build or extend an evaluation set in `evals/` and record a baseline with the current version.
5. **Implement the smallest coherent change.** Prompts are new immutable versions (`src/prompts/`). Earlier versions stay for replay and rollback.
6. **Measure again.** Tests pass (GREEN). Run the evaluation with repetitions, because model output varies between runs, and report the spread, not one number. If results disappoint, return to step 2 with the raw output rather than adjusting wording.
7. **Review and approve.** The engineer reviews the diff and the evidence. Nothing is committed or deployed without that approval. Every push deploys.
8. **Learn.** Production runs and the operator's choices (which candidate was picked, which suggestions were removed) feed the next evaluation set and spec.

## Principles

- **The AI suggests; code verifies; people decide.** Models read, match and draft. Code checks quotes, references, catalogue rules and prices, and owns every external write. People choose the business, the scope and whether to send.
- **No unmeasured claims.** Uncertainty is shown as uncertainty. "Unknown" is never treated as "absent". Numbers come from measurements with a stated method.
- **Worldwide by design.** Checks that must work in any language use Unicode normalisation and character-level comparison, not word lists or country rules. Tuning for the local market is acceptable when it is general.
- **Bounded and recoverable.** Paid calls are admitted once, cached by full input identity and limited per day. External writes are durable operations that are never blindly repeated.

## Example: business identity

- **Observe:** live searches for Swedish businesses stayed "ambiguous" or produced no suggestions. Saved runs showed the model had often found the right business.
- **Root cause:** identity was decided twice without shared evidence. The model gave a bare verdict, and a word-matching check could overrule it. The check assumed one sentence, the exact name and spaces between words. Two earlier wording fixes treated symptoms.
- **Measure first:** 11 fictional cases (legal suffixes, inflection, a script without spaces, same-name businesses elsewhere, injection) plus 6 frozen real searches. Baseline: 12/17.
- **Change:** the model returns quoted candidates; code verifies them with language-neutral checks ([identity](ARCHITECTURE.md#business-identity)).
- **Measure again:** 43/51 over three repetitions; matched sources 28/28. Remaining misses are documented in [evals/REVIEW.md](../evals/REVIEW.md).
- **Learn:** the remaining confusion was a fact only the operator can settle. That led to the [guided flow spec](specs/2026-10-11-guided-proposal-flow.md), where the operator chooses the business and website once.

## Where things live

| What | Where |
|---|---|
| Specs (why and what) | `docs/specs/`; earlier phase plans in `docs/superpowers/plans/` |
| Architecture and code map | [ARCHITECTURE](ARCHITECTURE.md), [WALKTHROUGH](WALKTHROUGH.md) |
| Prompt versions and provenance | `src/prompts/`, [PROMPTS](PROMPTS.md) |
| Evaluation sets and results | `evals/`, [evals/REVIEW.md](../evals/REVIEW.md) |
| Decisions and evidence, by date | [IMPLEMENTATION-LOG](IMPLEMENTATION-LOG.md) |
