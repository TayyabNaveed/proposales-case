# Phase 3 — AI service recommendations

10 October 2026. Implemented backend and operator evaluation; the workbench is connected in Phase 4.

## What is real

The installed Vercel AI SDK calls the configured DeepSeek model directly. A compact synthetic report and the trusted catalogue's scope/prerequisites are supplied; prices, provider credentials and tools are excluded. Structured output is independently checked for service IDs, quantity bounds, finding references, prerequisites, overlaps and abstention. This is service selection, not report research or Proposales AI.

Actual recorded run: `deepseek-flash`, prompt `service-selector-1`, schema `selection-2`. All 12 cases returned valid results on their first attempt. Outputs and usage are saved in [evaluation results](../evals/results/service-selection.json). The two primary examples also have [recorded recommendations](../src/domain/recorded-recommendations.json) for Phase 4's public read-only view. They are recorded AI outputs on synthetic reports, not live research or hardcoded AI claims.

| Example | Actual selection | Deterministic price, EUR excluding tax |
|---|---|---|
| Bicycle workshop, no website | Website foundation, two extra service pages, one FAQ page, ongoing maintenance; all core | €1,800 once + €80/month |
| Ceramics studio, existing site | Core enquiry improvement; optional FAQ and profile improvements | €400 core once; €550 optional once |
| Yoga studio, no website | Website foundation and booking integration | €1,600 once |

The workshop's AI output differs from the Phase 2 manually composed €1,500 smoke draft: it also selects a supported €300 FAQ page and treats requested maintenance as core. No existing Proposales draft was changed. Human review can adjust the eventual generated proposal in Proposales.

## Persistence and limits

- Store frozen report/catalogue inputs, identity, result, usage and timestamps in the private database schema. Additive migration003 preserves historical approvals and provider operations.
- Input identity hashes full source content, catalogue prices/scopes, access scope and model/prompt/schema versions. Canonical JSON makes object key ordering irrelevant.
- One short database transaction admits a run. No model/network request inside the transaction. Concurrent requests, including refreshes, share the current running admission.
- Validated ready results are cached for 24 hours. Failed runs remain failed and require explicit refresh. Running records are never automatically resubmitted; an explicit refresh may restart a stalled admission after 120 seconds, preserving the interrupted record.
- Twenty new admissions per access scope per UTC day. Each run has SDK retries disabled, at most one explicit validation repair (two HTTP attempts), 1,600 output tokens, 35 seconds per call and 75 seconds total.
- Compact excerpts are bounded; input JSON is capped at 18,000 characters. This targets a small prompt, not an exact tokenizer guarantee. Full original inputs remain in the hash and persisted record. Missing provider usage is null/incomplete, never asserted as zero.
- A lost persistence acknowledgement after a model response remains an uncertain running record. Explicit restart may duplicate a billed upstream call; caching is not upstream model idempotency.
- HTTP authentication and request budgets will be applied at the Phase 4 routes before any paid dispatch. No fresh generation endpoint is exposed by Phase 3.

## Evaluation and honest limits

Twelve fixtures and their labels were frozen before real execution: eight development, four held out. The same prompt was used throughout; no held-out tuning or repeated live runs. Label checks accept specified supported combinations, coverage alternatives and quantities rather than requiring identical rationale text or a complete exact list.

Observed in this single batch: 12/12 deterministic invariant checks passed and 12/12 labelled selection checks passed (8/8 development, 4/4 held out). These are small synthetic acceptance cases, not a general accuracy benchmark. Reference existence and valid JSON do not prove the interpretation is correct. [Semantic review notes](../evals/REVIEW.md) inspect actual explanations against evidence separately. Final proposal suitability, scope and recipient details remain a human responsibility.

## Commands

Use Node 24. Commands run from the standalone case directory.

- `node --import tsx --test tests/recommendations.test.ts tests/evaluations.test.ts`: offline SDK/selection/evaluation contracts.
- `node --import tsx --test tests/recommendations.integration.ts`: isolated database schemas and real concurrent admission; model HTTP is injected synthetic transport.
- `node --import tsx scripts/migrate.ts`: apply additive migrations.
- `node --import tsx scripts/run-recommendations.ts`: summarise saved outputs without environment loading or paid dispatch.
- `node --import tsx scripts/run-recommendations.ts --run`: bounded operator batch; reuse matching saved recordings and persistent ready cache.
- `--run --refresh`: deliberately admit a new batch, within the daily budget. Not an automatic error retry.

Scope: no UI changes, live Tavily research, Proposales account writes, email, deployment or repository sharing in this phase.

## Final verification

75/75 offline tests, 2/2 actual isolated database integration tests, TypeScript and production build passed. Fresh Astra review found no actionable defects; independently ran 10 focused tests and recomputed all twelve saved identities/label checks. Actual cached primary retrieval returned ready/cacheHit=true for both with zero model HTTP attempts. Deployment privileges, HTTP/UI wiring and draft generation remain their later gates.
