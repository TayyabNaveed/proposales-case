# AI-selected service modules and Proposales drafts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a tailored, correctly priced Proposales draft from AI-selected agency service modules, ready for one human review in Proposales.

**Architecture:** Structured report → bounded DeepSeek selector → deterministic catalogue validator → immutable generation snapshot → durable Proposales operation. One Next.js app; public examples and authorised model/provider actions. Live research is a subsequent producer of the same report contract.

**Tech Stack:** Existing Next.js/React/TypeScript, Zod, AI SDK/DeepSeek, pg/Supabase and Proposales adapter; Tavily in the later research task.

**Spec:** [Current architecture and exact catalogue](../../ARCHITECTURE.md).

## Global constraints

- This plan supersedes the remaining steps of the approval-first example-workflow plan. Existing migrations/data are preserved.
- Work inline in the user-selected standalone folder. It is not currently a Git checkout; no worktree/commit/remote operations until repository setup is user-directed. Record completed tasks and evidence in IMPLEMENTATION-LOG.md.
- No private Metascalers source, prompts, customer data, preparation files or sibling imports in this project.
- Use the 14 exact illustrative module IDs, scopes, prices and quantity bounds in the spec. EUR minor units, separate one-time/monthly and core/optional totals. No model-authored prices or discounts.
- No pre-draft business approval. Authorisation protects paid calls/account writes. One human review/edit and manual send in Proposales; local code must not infer review/sending from opening the editor.
- Never automatically repeat an uncertain provider write. Cache/memoisation is not provider-operation idempotency.
- Selection: one call plus at most one explicit repair, SDK retries zero, output cap 1,600 tokens, 35-second call limit/75-second total. Application cache 24 hours, scoped/versioned by full input content.
- Two primary examples, broader evaluation fixtures. Public stored outputs explicitly labelled; fresh model runs require access. No saved AI-output claims until an actual run exists.
- Native recurring/optional semantics are verification gates, not assumptions. No automatic email or customer recipient in smoke tests.
- Tests run with Node 24 using `node --import tsx --test …`; typecheck/build scripts already exist. Do not rerun account/model probes without a change or unresolved question.

## Review focus

1. Same website status, different stated needs: produce different defensible selections, not a website/no-website rule (Tasks 1, 3).
2. Model invents a service, price, evidence reference or package overlap: fail validation; no provider write (Tasks 1, 3, 4).
3. Two clicks, two server instances or lost provider response: one creation admission; persist/reconcile unknown state (Task 4).
4. Provider creates a draft but changes amount/billing or fidelity read fails: retain identity and show verification warning; never regenerate blindly (Tasks 2, 4).
5. Public caller, stale selection/catalogue or report prompt injection: reject unauthorised/stale requests and ignore instructions embedded in evidence (Tasks 3, 4, 5).

## Contract and file map

Keep existing provider transport, database connection, access helpers and operation store. Add focused modules rather than another service or agent framework.

- `src/domain/reports.ts`: export `ReportV2`, fixtures and runtime schema. Fields: id, version=2, mode=synthetic|live, businessName, identityStatus=confirmed|ambiguous, goals (text, sourceId), capabilities (website, profile, campaign each present|absent|unknown), findings (id, section, claim, observed|inferred|unknown, evidenceIds), actions (id, text, findingIds), evidence (id, label, excerpt, optional URL/retrievedAt, synthetic), uncertainties.
- `src/domain/catalogue.ts`: export `CatalogueV2`, `catalogue` and `catalogueVersion`; exact spec catalogue with price/scope/prerequisite/overlap metadata.
- `src/domain/selection.ts`: runtime model-output schema and `validateSelection(report: ReportV2, raw: unknown, catalogue: CatalogueV2): SelectionResult`. Result contains unique items `{serviceId,quantity,disposition:'core'|'optional',findingIds,rationale}`, questions and abstention reason. Prices excluded from model schema. Unknown identity supports abstention only.
- `src/domain/offers.ts`: replace `buildOffer` with `buildDraftSnapshot(report: ReportV2, selection: SelectionResult, catalogue: CatalogueV2): DraftSnapshot`. Snapshot includes selected catalogue terms, input/version hashes and four totals; no human approval fields.
- `src/server/providers/recommendations.ts`: `recommendServices(report: ReportV2, catalogue: CatalogueV2, options: {signal?: AbortSignal}): Promise<RecommendationRun>`. Run holds validated selection, report/catalogue hashes, model/prompt/schema versions, usage, duration and validation outcome. Uses existing DeepSeek configuration.
- `src/server/recommendations.ts`: `getOrCreateRecommendation(reportId: string, accessScope: string, refresh: boolean): Promise<RecommendationRecord>`; database admission/cache, uses server-owned reports. Record has ID, input hash, running|ready|failed state, result and expiry. No arbitrary browser-supplied model prompt.
- `src/server/drafts.ts`: `getOrCreateDraftSnapshot(requestId: string, recommendationId: string, selections: SelectionResult['items'], accessScope: string): Promise<StoredDraftSnapshot>`. Revalidate selected items against persisted report/catalogue; do not trust client rationale/prices. Stored snapshot has ID, immutable content/hash and scope.
- `src/server/workflow.ts`: replace approval dependency with `createDraftFromSnapshot(snapshotId: string, accessScope: string): Promise<DraftOutcome>`. Outcomes: in-progress, unknown, verified draft, or existing draft needing fidelity review. Use provider-returned verified editor URL.
- `src/server/providers/proposales.ts` and `proposales-mapping.ts`: content creation/retrieval, validated product/variation mapping, draft blocks and fidelity comparison; keep scoped transport and no-write-retry policy.
- `src/server/provider-assets.ts`: persisted seed admission and mapping; confirmed product/variation numeric IDs differ from draft UUIDs, so use their own typed store.
- `db/migrations/003_recommendations_and_drafts.sql`: recommendation runs/cache and immutable draft snapshots; additive private-schema/RLS/revocations. `004_provider_assets.sql`: seed operation/state and mapping. No deletion of legacy approved_offers.
- `src/app/api/recommendations/route.ts`, `src/app/api/drafts/route.ts`, `src/components/ExampleWorkbench.tsx`: selected report, recommendations, optional adjustments, generate draft and open in Proposales. Retire approval endpoint from active UI; preserve old records.
- Later: `src/server/providers/tavily.ts`, `src/server/research.ts`, `src/app/api/research/route.ts` feed ReportV2.

Exact module schema details may use Zod inference; preserve the named interfaces and ownership boundaries above. Use canonical stable hashes for JSON content so database key ordering does not change identity.

## Task 1 — Meaningful catalogue modules and structured reports (Phase 1)

**Files:** domain report/catalogue/selection/offers files above; `tests/selection.test.ts`, `tests/offers.test.ts`, `tests/fixtures/reports.ts`.

- [x] Write failing tests: website-base=120000 minor units, service-page quantity 2=30000, maintenance=8000/month; these produce 150000 core one-time and 8000 core monthly. Optional items must not enter core totals. Unknown IDs, duplicate IDs, fractional/over-limit quantities, unknown evidence, website-base plus duplicate enquiry work and unsupported profile recommendations fail. No selections is valid; blank draft is not.
- [x] Run domain tests and observe relevant failures; implement exact spec catalogue and ReportV2 with two primary examples plus same-status/different-needs and ambiguity fixtures for evaluation.
- [x] Implement validation/buildDraftSnapshot. Preserve original scope exclusions; group catalogue for readability, not a three-item cap. Prerequisites use explicit capabilities/evidence or selected foundations. Additional page quantities represent pages beyond included base scope.
- [x] Run domain tests and typecheck; log evidence. Demo rates remain clearly illustrative.

## Task 2 — Real Proposales library and priced draft contract (Phase 2)

**Files:** provider adapter/mapping/asset store, migration004, `scripts/seed-services.ts`, `tests/providers.test.ts`, `tests/provider-assets.test.ts`, `tests/provider-fidelity.test.ts`.

**Consumes:** CatalogueV2. **Produces:** `seedService(serviceId: string, ownedImageUrl: string): Promise<SeedOutcome>` and `getServiceMapping(serviceId: string, catalogueVersion: string): Promise<{productId:number;variationId:number}>`. Adapter methods `createPricedDraft(snapshot, operationKey)` and `verifyPricedDraft(uuid, snapshot, operationKey)` return safe projections.

- [x] Obtain the owned public asset URL (already requested) or use the authored illustration after separately authorised hosting. Read full content/block contracts. Do not guess remote image or billing fields.
- [x] Write failing tests for product versus variation ID, invalid company/URLs, seed concurrency, lost create response and unsupported recurring mapping. Asset table uses company+catalogueVersion+serviceId seed identity and claimed/unknown/confirmed states; no automatic re-seed on timeout.
- [x] Implement additive migration and seed/store adapter. Retrieve known content, project only needed fields and persist mappings. Library titles are labelled case demo. Reconciliation uses observed supported lookup; no-match never authorises another create.
- [x] Probe one item first; compare documented versus observed response. Seed remaining items only after contract passes. Synthetic scope/media only.
- [ ] Create one recipient-free multi-service test draft using the existing operation mechanism. Retrieve, compare amounts/quantity/tax, optional and recurring semantics, then inspect in Proposales. Record actual editor URL and fidelity. If recurring support differs, document and verify the representation before enabling it. Description-only creation does not pass this task.
- [x] Run targeted provider/fidelity tests and typecheck. Record IDs privately, safe evidence publicly. While image is pending, proceed with Task 3; do not mark this gate done.

API portion and fidelity checks passed; the unchecked draft step remains solely for user visual inspection. See [Phase 2 evidence](../../PHASE-2.md).

## Task 3 — AI recommendation on existing reports (Phase 3)

**Files:** recommendation provider/service, migration003 recommendation part, `tests/recommendations.test.ts`, `tests/recommendations.integration.ts`, `evals/service-selection.ts`, `evals/fixtures/`.

**Consumes:** ReportV2 and CatalogueV2. **Produces:** persisted RecommendationRecord via interfaces above.

- [x] Write failing tests using injected model transport: unsupported IDs/prices/quantity, missing evidence references, service overlap, injection requesting secret access or pricing changes, valid abstention and one bounded repair. Assert actual HTTP attempts ≤2, no duplicate billed dispatch under concurrent identical requests and no failed output cached as success.
- [x] Implement AI SDK structured selection and validation. Supply compact report/findings, trusted catalogue constraints and short evidence excerpts. No tool execution requested by report text. Do not copy private Metascalers prompts.
- [x] Persist run admission/results, safe diagnostics and 24-hour cache. Keys include full report/evidence/goals content, catalogue content, access scope and prompt/model/schema versions. Explicit refresh has its own admitted run and budget. A claimed run is not silently retried while another request is active.
- [x] Add 12 labelled evaluation fixtures (8 development, 4 held out), allowing reasonable acceptable service sets rather than demanding a single exact creative answer. Include two no-website businesses whose booking/service needs differ, existing-site improvement, missing facts, overlaps and abstention. Separate invariant checks from human judgement of relevance/support.
- [x] Run one bounded real selection for each primary example and save provenance/usage. Public saved results are labelled recorded; authenticated fresh generation stays available. Evaluate the set with reported actual counts, model/prompt versions and limitations; no invented pass rate.
- [x] Pass focused tests/typecheck and isolated persistence tests. Failure is actionable; it does not silently substitute hardcoded “AI” output.

## Task 4 — Generation snapshots and durable draft creation (Phase 4, backend)

**Files:** drafts/workflow, migration003 snapshot part, `src/app/api/drafts/route.ts`, `tests/workflow.test.ts`, `tests/drafts.integration.ts`.

**Consumes:** persisted RecommendationRecord, server-owned catalogue/report, confirmed service mappings. **Produces:** stored DraftSnapshot and DraftOutcome.

- [x] Write failing regressions: unauthorised creation, stale catalogue/report/recommendation, client price/rationale tampering, selected items not supported by the report, same request/different payload conflict, equivalent repeat payload, concurrent instances, lost provider response and failed fidelity read.
- [x] Implement immutable generation snapshot admission in place of approved-offer lookup. Validate request ID and scope; persist safe selected-item content reconstructed from server data. Same generation request/content reuses identity. Material changes create a new snapshot; no human-approval flag.
- [x] Reuse operation store scoped to company+snapshot identity/hash. Save UUID immediately after successful creation, then verify provider fidelity. Preserve unknown outcomes and provide reconciliation/status through a protected `GET /api/drafts?id=...` read. Read authorisation must not require an Origin header; same-origin checks remain on mutations.
- [x] Repeated clicks return the existing result. A user requesting another version does so explicitly with a new generation request; never overwrite an existing provider-edited draft automatically.
- [x] Pass offline workflow tests and two-client/reconnect integration tests in an isolated schema. Preserve old approval rows, remove active API dependency and document their historical status.

## Task 5 — Simple report → recommendation → Proposales review UI (Phase 4, frontend)

**Files:** ExampleWorkbench, recommendations route, session/access copy, drafts route, README and WALKTHROUGH; `tests/http.integration.ts` plus browser checks.

- [x] Add route regressions for access before model/provider dispatch, cross-origin mutations, oversized/invalid inputs, stale selection and duplicate draft request. Keep auth/rate limits; name access as demo/account access, not human proposal approval.
- [x] Show two primary examples with meaningful report sections. Public visitors see synthetic reports and recorded recommendations labelled with provenance; gated fresh AI selection shows bounded progress and useful failure/abstention states.
- [x] Display selected modules, reasons, fixed unit costs/quantities, optional items and separate monthly/one-time totals. Permit selection adjustment; revalidate server-side. Missing information is visible without another approval screen.
- [x] Replace “Approve offer” with “Generate Proposales draft”; show “Open in Proposales to review” only for a known result. Fidelity warning offers existing-draft inspection; unknown outcome offers status/reconciliation and explicit retry of the identical admitted request, never a new UUID.
- [x] Remove UI reliance on `/api/offers`; retire that unused write endpoint while preserving legacy data and updating tests. Confirm edits cannot display an unrelated previous draft as current.
- [x] Verify keyboard/mobile/desktop, session expiry, refresh/reconnect and public permissions. Complete an actual example → fresh AI recommendation → verified unsent draft → open Proposales flow. No email during tests.

Phase4 verified 10 October: 95 offline tests, actual isolated DB4/4, HTTP1/1, build/typecheck, browser keyboard/mobile/session/cache checks, real fresh-AI→verified unsent draft and repeat/reconnect identity. Provider editor login/visual acceptance remains user-controlled; no email sent. See PHASE-4.md and IMPLEMENTATION-LOG.md.

## Task 6 — Focused live research and reuse (Phase 5)

**Files:** Tavily/research providers, research route and input UI; `tests/research.test.ts`, `tests/research.integration.ts`.

- [x] Write failing tests for ambiguous identity, unsupported absence claims, injected source instructions, partial/failed search, exceeded budgets and cache isolation/invalidation.
- [x] Implement name/location/optional website input and bounded search/extraction/report output as specified. No PageSpeed, precise search ranks or fabricated platform analytics. Source-linked findings, opportunities and unknowns feed ReportV2.
- [x] Cache successful evidence/reports separately from recommendations; carry source retrieval times and explicit refresh. Do not rerun research for an existing structured report. Reuse the same selector/draft path.
- [x] Run one live researched flow and failure case; record time/credits/tokens and support checks. If this misses the freeze target, label it deferred and retain the working AI+Proposales example core.

Phase5 verified 10 October: 108 offline tests, research DB2/2 and HTTP1/1, TypeScript/build, real Tavily→report→selection and browser cached reuse. See PHASE-5.md for actual usage, failed validation attempts and accuracy limitations.

## Task 7 — Quality, hosting and handover (Phases 6–8)

**Files:** README, WALKTHROUGH, IMPLEMENTATION-LOG, capability evidence, `.env.example` and deployment configuration; private preparation remains outside this folder.

- [ ] Run applicable offline/typecheck/build checks, isolated DB tests and real provider fidelity smoke once after final functional changes. Fix material failures with focused regressions. Use one independent review of the slice, not a new reviewer for each small task.
- [ ] Review the exact standalone file manifest, env boundaries and any eventual Git history. User supplies repository destination/access. Do not upload the parent workspace or private planning files.
- [ ] Configure least-privilege application DB role, trusted proxy/rate-limit identity, function limits, exact deployed APP_ORIGIN, secure cookies and server env. Deploy only the reviewed standalone app to the user's Vercel project under their hosting authorisation; account/project details are an input, not something to guess.
- [ ] Verify deployed example/model/draft flow and unknown/failure state with synthetic data. Record what is live, recorded, planned and unsupported. Update setup and walkthrough to final code.
- [ ] Preserve Sunday for personal verification and explanation of catalogue selection, price ownership, provider blocks, uncertainty and duplicate recovery. Monday submission remains user-controlled; confirm exact cutoff when available.

## Completion and rollback

Complete core means actual AI service selection creates a correctly represented unsent Proposales draft that opens for one human review. A local quote, hardcoded recommendations or description-only draft is insufficient. Preserve durable generation/operation records on failure; never delete them to force retries. Migrations are additive. Disable creation when contract verification fails while keeping public examples and existing draft status available.

Self-review: every changed requirement has an owning task. Priced content is the critical provider gate; catalogue/selector work can proceed while its asset dependency is unresolved. UI example count is separate from evaluation breadth. This plan changes future work; it does not claim the revised flow is implemented.
