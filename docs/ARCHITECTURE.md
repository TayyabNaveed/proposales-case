# Current architecture — 10 October 2026

The case turns business evidence into catalogue recommendations and an unsent Proposales proposal. The agency operator reviews suitability, prices and recipient details once in Proposales, then sends manually. Research is the primary journey; two fictional examples explain the same flow. Pricing is illustrative.

## System map

| Boundary | Responsibility |
|---|---|
| `src/app/page.tsx` → `ExampleWorkbench.tsx` | Two accessible tabs, shared access, cross-tab pending-request recovery. Both journey views stay mounted. |
| `ResearchPanel.tsx` → `domain/analysis-flow.ts` | Deliberate analysis/continuation coordinates separate protected requests. Restore reads saved stages without dispatching work. |
| `components/workbench/useDemoSession.ts` | Shared signed demo access/session expiry. |
| `components/workbench/useProposalWorkflow.ts` | Recommendation, selected scope, immutable request identity, recovery and proposal handoff. |
| `ReportView`, `ServicesView`, `ProposalView` | Evidence/unknowns, supported scope adjustments and four price totals, explicit creation and editor link. |
| `app/api/*` → `server/api.ts`, `research-api.ts` | Exact-origin mutation checks, signed scope, action limits, bounded strict inputs and safe errors. |
| `server/services.ts` | Wires application services, database and providers. Credentials stay server-side. |
| `server/research.ts`, `recommendations.ts`, `drafts.ts` | Scoped admission/cache, report/recommendation resolution, immutable generation snapshots. |
| `server/operations.ts`, `db.ts`, `workflow.ts` | Durable external-write identity, response-loss reconciliation and fidelity reads. |
| `server/providers/*` | Fixed Tavily/DeepSeek endpoints and Proposales transport/composition. Source text cannot execute tools. |
| `src/prompts/*`, `server/prompt-provenance.ts` | Immutable readable prompt sections, operational configuration and request/version fingerprints. |
| `domain/*` | Evidence contracts, catalogue/dependencies, canonical validated selection, deterministic integer pricing, presentation-only ordering. |

## Execution paths

Live: name and location → `POST /api/research` → bounded Tavily sources → `POST /api/identify` → up to three verified candidate businesses with website suggestions → **operator chooses the business and states the website** → `POST /api/reports` with that choice → a DeepSeek report from the chosen business's sources only → `POST /api/recommendations` → catalogue selection. The report appears before selection completes. A saved report is reused only for the same choice.

Examples: public synthetic reports + recorded recommendations → authenticated preparation via the same selector → adjustments → proposal. Reading examples does not call a provider.

Creation: `POST /api/drafts` → scope-owned existing request lookup or fresh validated snapshot → durable operation claim → recipient-free Proposales create → saved UUID/link → fidelity read. Repeated requests reuse the immutable snapshot, even after recommendation/report expiry. Materially different payloads conflict. Status reads may reconcile exactly one matching provider result; missing/ambiguous matches never permit another create.

## Business identity

The identify stage (`business-identity-1`) decides which businesses the sources describe and returns its evidence: up to three candidates, each with source IDs, a name quote and an optional location quote copied from one source (`domain/identity.ts`). Code checks only what it can check in any language:

- Each quote appears in its source after Unicode normalisation, case folding and whitespace collapse.
- The quoted name contains the typed name: character-bigram containment, so it needs no word boundaries.
- The candidate is anchored by one of three routes:
  - its source is on the supplied website;
  - the typed location appears as continuous text in that source;
  - the model's location quote from that source resembles the typed location.

Unverified candidates are removed and their rejection codes kept. Identity is confirmed only for exactly one verified candidate, and only when the model agreed or every competing candidate was verifiably in another location. The operator then chooses one verified candidate in a dialog, and states the website: a verified suggestion (one per domain, never a directory or social site), a typed address, or none. The report records that choice as `chosenBy: "operator"`, and the website capability is `present` or `absent` with `confirmedBy: "operator"`. The AI never asserts it. With no website, building one is a valid suggestion.

Code cannot judge meaning. If an excerpt names the business next to a place that refers to something else, the model's judgement decides, and the quotes are shown so a person can see why. `evals/identity` measures this on fictional cases; real-business cases stay private.

## Proposal composition

- **New drafts use `proposal-3`.** The title is the business name with "growth plan from <agency>". The description is the operator-approved introduction plus "Prices exclude VAT."; fictional examples say so. The recipient is optional. Review questions are shown in the app, never in the proposal.
- **Immutable request.** The introduction and recipient are part of the immutable request and snapshot. A repeated request with different text is a conflict.
- **Read-back check.** It confirms the recipient matches what the operator entered, or is absent.
- **Earlier drafts are untouched.** `proposal-2` and legacy drafts keep their exact payload and checks.
- **Operator-added services** carry no "Why" line. The agency description lives in `domain/agency.ts`.

## Identities and compatibility

`server/canonical.ts` preserves historical canonical JSON/hash bytes. Alphabetic service order remains canonical. `domain/presentation.ts` independently orders core/foundational work, supporting work, monthly services and optional extras.

New snapshots pin `compositionVersion=proposal-2`. The provider composes those in presentation order with accurate live/example wording. Each block carries its library item's image: Proposales replaces an empty image list with that image (observed 10 October), so a lead-only image cannot be expressed at creation. Older snapshots have no composition version and retain original order, copy and per-block imagery for retrieval/fidelity. Unknown composition versions fail. No prior draft is rewritten.

Browser recovery is saved before dispatch. Web Locks serialize localStorage admission across browser documents on the same origin; a different saved request is blocked. Native storage events update other windows. A saved proposal takes precedence over normal research restoration. Web Locks are a browser safeguard; durable server operation identity remains the write authority. Clearing browser storage or separate browser profiles can lose the browser pointer; operator/server recovery is still needed. This shared demo is not a multi-user identity system.

Prompt/cache provenance includes template/config/schema fingerprints, input-builder and validation versions, full report/catalogue/evidence identity and scope. Effective request hashes and returned model identifiers are retained when available. Legacy records remain readable; new identities do not relabel recorded outputs as fresh calls.

## Persistence and operational bounds

Additive migrations 001–005 retain operations, historical approvals, assets, recommendation/snapshot records and research heads/runs/budgets. No migration is needed for JSON provenance/composition fields in this refinement. Separate successful caches last24hours. Paid stage budgets and deadlines remain enforced. Research failure diagnostics retain safe usage/timing/model/version data; missing usage remains unknown. No raw secret/provider error body is projected.

`domain/offers.ts` contains active snapshot pricing plus an explicitly marked historical offer bridge. `server/offers.ts` and `createReviewedDraft` remain compatibility/operator paths; `/api/offers` returns410. Active generation has no pre-draft approval.

## Remaining boundaries

Least-privilege database role, trusted proxy identity, deployed origin/cookie/function limits and hosting remain Phase6. Final native Proposales visual acceptance is a human check. Reviewer feedback/evaluation comparison is later scope. Research excerpts, heuristic identity and schema validation do not prove general factual correctness; twelve selector fixtures are a small synthetic evaluation. See `QUALITY-REFINEMENT.md`, `PHASE-5.md` and `evals/REVIEW.md` for actual evidence and limitations.
