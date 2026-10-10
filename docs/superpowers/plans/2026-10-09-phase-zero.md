# Phase Zero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish tested provider contracts and a reproducible local setup before building the example-to-draft workflow.

**Architecture:** One Next.js app with server-only provider modules and dedicated Supabase Postgres. Phase 0 probes use synthetic data and redacted results; the finished UI is a later slice.

**Tech Stack:** Node.js 24, TypeScript, Next.js, Vercel AI SDK, DeepSeek provider, Zod, node-postgres (pg), Supabase and Proposales. Installed versions and live evidence are in the result ledger.

**Spec:** [Technical design](../../ARCHITECTURE.md)

## Global Constraints

- Server-only secrets; no raw responses or credentials in committed evidence.
- At most 1 retry for eligible safe reads; no blind retry of uncertain writes.
- Search timeout 15 seconds per attempt; model timeout 35 seconds; workflow deadline 120 seconds including retries.
- Example data is synthetic; created proposals remain unsent.
- An adapter is a server module in the same application, not a separate deployment.
- Exact model/versions are selected by verification, not guessed from legacy aliases.
- This plan covers discovery only; the full product design requires subsequent implementation slices.

## Review Focus

1. Valid token but wrong company: refuse to silently select another company (Task 2).
2. HTTP 200 with an unexpected response shape: fail contract validation without exposing the raw body (Task 2).
3. Proposal accepted but response lost: stop in an unknown state, preserving operation identity (Task 3).
4. Schema-valid fabricated model output: report schema and evidence-support outcomes separately (Task 4).
5. Database reconnect or simultaneous operation claim: durable uniqueness still prevents a second claim (Task 3).

## File responsibilities

- `README.md`: current setup and actual implementation status.
- `.env.example` / `.gitignore`: secret variable names and local-file exclusion.
- `docs/ARCHITECTURE.md`: reviewer-facing design and acceptance criteria.
- `docs/PHASE-0.md`: redacted observed capability results and unresolved constraints.
- Future `scripts/probe-providers.ts`: opt-in bounded provider checks; safe summaries only.
- Future `src/server/providers/proposales.ts`: HTTP client and runtime-validated provider contracts.
- Future `src/server/providers/deepseek.ts`: model generation options and usage mapping.
- Future `src/server/db.ts`, `db/migrations/001_operations.sql`: server connection and durable probe-operation admission.
- Future `tests/providers.test.ts`, `tests/operations.test.ts`: mocked failure cases and isolated database integration checks.

No future file listed above exists merely because it appears in this plan. Persist local operational identifiers in the dedicated DB; do not commit account data to fixtures.

## Task 1: Configuration and documentation baseline

**Files:** `.env.example`, `.gitignore`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PHASE-0.md`.

**Interfaces:** Produces configuration names and status ledger consumed by the account probes.

- [x] Record selected deployment/module/database boundaries and reasons.
- [x] Create secret-free environment template and local environment exclusion.
- [x] Inspect local Node and public dependency metadata; distinguish compatibility metadata from successful runtime tests.
- [x] Record account capabilities as unverified until observed.
- [ ] Configure account credentials locally; check presence without displaying values.

## Task 2: Read-only company and content contracts

**Files:** create `package.json`, lockfile, `tsconfig.json`, `scripts/probe-providers.ts`, `src/server/providers/proposales.ts`, `tests/providers.test.ts`; update `docs/PHASE-0.md`.

**Interfaces:** `listCompanies(signal: AbortSignal): Promise<CompanySummary[]>`; `CompanySummary = { id: string; name: string; currency: string }` after normalising verified ID shape. `listContent(companyId: string, signal: AbortSignal): Promise<ContentSummary[]>`; `ContentSummary = { productId: string; variationId: string }`. Never expose full transport payloads from these methods.

- [ ] Add exact verified dependency versions and scripts `test` and `probe`; commit the resolved lockfile only after installation/type checking succeeds.
- [ ] Add tests for missing token, wrong configured company, unexpected HTTP-200 shape, bounded 429 retry, and sanitized errors; run `npm test -- tests/providers.test.ts` and verify failure before implementation.
- [ ] Implement read contracts from full endpoint docs plus observed shape; reject unexpected schemas and treat provider strings as data.
- [ ] Run the same tests; all assertions must pass, including no token/inbox token/raw body in summaries.
- [ ] Run `npm run probe -- companies` using local credentials. Record count/shape/status; select configured scope explicitly. If more than one company is plausible, obtain user selection.
- [ ] Run `npm run probe -- content` for the selected company; record ID mapping and whether library is empty, excluding private content.

## Task 3: One real fictional draft with recoverable writes

**Files:** extend probe/provider/tests; create `src/server/db.ts`, `db/migrations/001_operations.sql`, `tests/operations.test.ts`; update ledger.

**Interfaces:** `claimOperation(key: string, payloadHash: string): Promise<'claimed' | 'existing' | 'conflict'>`; `recordOutcome(key: string, outcome: { state: 'confirmed'; providerId: string } | { state: 'unknown' }): Promise<void>`. Provider creation contracts are derived from Task 2's observed company/content shape and complete endpoint docs before coding; do not guess commercial field mappings.

- [ ] Verify dedicated Supabase TLS connection through transaction pooler; pg without named prepared statements/pipelining, initial `max: 1`. Record only success, latency and DB compatibility.
- [ ] Write operation tests for atomic concurrent claim, reconnect/persistence, payload conflict, lost response and recovery after provider success but before local persistence. Use an isolated test schema and mocked provider for failures.
- [ ] Run `npm test -- tests/operations.test.ts`; verify intended failures, then implement durable unique operation rows and pass the suite.
- [ ] Read create/get/edit/search endpoint docs fully. Finalise minimal synthetic payload and one owned image if content creation is required. Persist write identity before dispatch; retries must reuse stored records.
- [ ] Create/reuse a fictional content item, then one unsent proposal. Capture IDs privately; verify retrieval and actual price/billing mapping in the dashboard.
- [ ] Exercise metadata/search lookup for that known draft. Inspect response shape and record the recovery path. Never simulate a real lost response by repeatedly creating account drafts.
- [ ] Record supported/unsupported/unknown findings. If mapping or access is blocked, investigate existing content/templates and prepare precise clarification questions; do not send them automatically.

## Task 4: Bounded model compatibility

**Files:** create `src/server/providers/deepseek.ts`; extend provider tests/probe and ledger.

**Interfaces:** `probeStructuredModel(signal: AbortSignal): Promise<{ schemaValid: boolean; evidenceSupported: boolean; elapsedMs: number; inputTokens?: number; outputTokens?: number }>` using fixed synthetic evidence and an exact verified model ID.

- [ ] Verify account-accessible model IDs and AI SDK provider support; store selected ID in local configuration and safe version metadata.
- [ ] Test valid structure with unsupported claim, malformed output, deadline cancellation and explicit SDK retry accounting. Run the provider test file and observe failures before implementation.
- [ ] Implement one bounded synthetic generation with schema validation and a separate fixed-evidence support check. Use `maxRetries: 0` for the initial probe, 35-second deadline and a small explicit output cap.
- [ ] Pass the tests, then run one real `npm run probe -- model`; record exact model/settings, latency and available usage fields. A single successful result is a compatibility observation, not an accuracy benchmark.

## Task 5: Discovery exit and next slice

**Files:** update `docs/PHASE-0.md`, `README.md`, `docs/ARCHITECTURE.md` where observations change design.

- [ ] Reconcile documented claims with actual probes. Keep optional webhook/sending/Tavily checks separate from the core draft gate.
- [ ] Record the minimal verified payloads as synthetic/redacted fixtures, outstanding questions and fallback decisions.
- [ ] Plan the complete example → recommendation → human review → persisted real draft slice using the verified contracts. Live research stays subsequent.

## Recovery and completion evidence

Do not delete existing provider records or run destructive database resets. If a probe is interrupted, inspect its durable operation before any retry. Keep local secret files out of the future repository and scan the eventual staged file list before sharing. No remote, public repository or deployment is created by this plan.

Required completion evidence: passing targeted contract/operation tests, one retrieved unsent fictional draft with checked amounts, a recorded uncertain-write recovery decision and one bounded compatible model result. Until these exist, Phase 0 remains in progress.

Self-review: scoped to Phase 0; five review concerns mapped to owning tasks. Product UI, full evaluation suite, caching and deployment are deliberately subsequent slices rather than claimed as discovery deliverables.

## Execution status — October 9

- [x] Task 1 baseline and local configuration.
- [x] Task 2 scoped company reads and contract/failure tests. Library count verified; nonempty item mapping deferred explicitly.
- [x] Task 3 operation admission, crash-window tests, isolated database concurrency/reconnect check, one real unsent description-only draft, metadata/search and repeated-command reuse.
- [ ] Task 3 content image, service blocks and monetary/billing mapping; carried to next slice with hosted owned asset. No UI inspection claimed.
- [x] Task 4 compatible account model, bounded real generation, runtime schema and separate fixture support checks.
- [x] Task 5 independent review, regression fixes and documentation handoff; UI/priced-block plan is separate.

See IMPLEMENTATION-LOG.md for rulings and observed test sequence. The original per-step checklist above is the planned sequence; this status records completed deliverables and explicit gaps. No Git commit exists because repository setup is still deferred.
