# Current architecture — 11 October 2026

Fieldwork turns business evidence into catalogue recommendations and an unsent Proposales proposal. The operator confirms business identity, adjusts scope, reviews an introduction and recipient, and creates a draft. Sending happens manually in Proposales. Prices are illustrative.

## System map

| Boundary | Responsibility |
|---|---|
| `app/page.tsx` → `ExampleWorkbench.tsx` | Server-read access state; landing instructions; sidebar for research, examples and proposals; shared recovery and usage. Journey views remain mounted when hidden. |
| `ResearchPanel.tsx` → `domain/analysis-flow.ts` | Separate source, identity and report requests; operator business/website choice and client notes; saved-stage restoration without paid dispatch. |
| `components/workbench/useDemoSession.ts` | Signed demo access and visible expiry. Open dialogs are removed on expiry. |
| `components/workbench/useProposalWorkflow.ts` | Suggestions, operator scope edits, browser request identity, recovery and draft handoff. Relevant storage events preserve edits except when restoring pending scope. |
| `ReportView`, `ServicesView`, `ProposalView`, `CreateProposalDialog` | Evidence and unknowns, catalogue adjustments, four totals, review questions, approved introduction/recipient and creation. |
| `useProposals`, `ProposalsList`, `UsageLine` | On-demand provider status and saved scope decisions; admitted research/model usage for today and the UTC month. |
| `app/api/*` → server handlers | Signed scope, exact-origin mutation checks, strict bounded input, action limits and safe errors. |
| `server/services.ts` | Database/provider wiring. Credentials stay server-side. |
| `research.ts`, `recommendations.ts`, `intro.ts`, `drafts.ts` | Scoped cache/admission, paid stages and immutable proposal snapshots. |
| `operations.ts`, `db.ts`, `workflow.ts` | Durable external-write identity, uncertain-outcome reconciliation and read-back verification. |
| `providers/*`, `category-assets.ts` | Fixed provider endpoints, pinned library/template assets and versioned proposal composition. |
| `prompts/*`, `prompt-provenance.ts`, `domain/*` | Prompt/config fingerprints; validated evidence, catalogue dependencies and deterministic integer pricing. |

## Execution paths

Live research: name and location → `POST /api/research` (Tavily sources) → `POST /api/identify` (DeepSeek candidates and quotes) → operator confirms a business and its website, with optional client notes → `POST /api/reports` (chosen sources only) → `POST /api/recommendations` (catalogue selection). The report is visible before selection finishes. A report cache is specific to the confirmed choice.

Examples: public fictional reports and recorded recommendations → authenticated preparation using the same selector → operator adjustments. Reading examples calls no provider.

Creation: editable scope → `POST /api/intro` (supported sentences within 1,500 characters) → operator approves introduction and optional recipient → `POST /api/drafts` → existing scoped request or new validated snapshot → durable operation claim → Proposales create → saved provider identity → fidelity read. A recipient is supplied only when the required email is present. Nothing is sent by this app.

A repeated request must match its original recommendation, selections and presentation. It reuses the saved snapshot even after research/recommendation expiry. Changing those inputs under the same ID conflicts. Status reads may reconcile one matching provider result; failed, missing or ambiguous matches never authorise another external create.

## Business identity and evidence

The identify stage returns up to three candidates with source IDs, a name quote and an optional location quote. Code checks copied quotes after Unicode normalisation, case folding and whitespace collapse. Name matching uses character-bigram containment. A candidate is anchored by the supplied website, the typed location in its source, or a matching location quote. Unverified candidates are removed with rejection codes retained.

The operator chooses one verified candidate and a suggested/typed website or none. The report records `chosenBy: "operator"`; website presence is confirmed by the operator. Client notes are attributed separately from public evidence. A no-website choice can support building one.

Quote and schema checks do not establish semantic truth. An excerpt can mention a place in an unrelated context, or repeat an opinion or outdated claim. The operator can inspect sources and rationale. Synthetic identity/selector evaluations measure limited cases, not general accuracy.

## Proposal composition and compatibility

New drafts default to `proposal-5`; `PROPOSAL_COMPOSITION=proposal-4` or `proposal-3` changes only new snapshots. Unknown versions fail. Existing snapshots retain their version, prices, presentation and asset references.

The five category library entries are presentation containers. The service catalogue remains the authority for scope, quantities and prices. Core services group by category and billing period; optional services stay independently selectable. Snapshot asset references pin company, library identity and artwork hashes. For proposal-5, the configured agency template's cover is read and pinned when available.

Proposal-5 uses client-facing section rows and investment wording. Read-back verifies rows, order, quantities, prices, units, notes, block controls, recipient and any pinned cover. Review questions remain in the app. Proposal-4, proposal-3, proposal-2 and legacy mappings retain their historical payload/check paths. No existing proposal is rewritten.

`server/canonical.ts` preserves historical hash bytes; changing its locale-dependent key sort requires a versioned migration. Presentation ordering is separate from canonical identity.

## Recovery and status

The browser saves request ID, selections and approved text before POST. Web Locks serialise same-origin browser admission; server operation identity is the authority for external writes. A scoped request lookup with no snapshot returns `not_started` without dispatching creation. The original saved request can be retried. When the lookup names the request's recommendation, an absent request whose suggestions have expired returns `expired`, which releases the browser copy. That answer is final: a snapshot save holds a share lock on the recommendation and checks expiry against the database clock under it, and the lookup takes a conflicting lock, so a save already in flight commits first and none can start later. Snapshot-ID misses and database failures remain errors.

Unreadable recovery JSON blocks creation until the operator checks Proposales and discards that browser copy. Discard checks that the copy has not changed since it was read. Inaccessible storage has a separate message and no discard action. Clearing storage or using another browser profile can lose the pointer; these safeguards are not a multi-user identity system.

`GET /api/proposals` lists up to 20 scoped snapshots, newest first, joined to recommendation and provider-operation records. It reads live provider status four at a time: draft, active/sent, accepted, rejected, expired, withdrawn or replaced. Missing operations and rejected creates are not created; claimed/unknown operations show an unknown outcome. A failed provider read preserves the row with unavailable status. Accepted proposals open their view and may include a PDF link. Sending and status changes remain in Proposales.

## Persistence and operations

| Migration | Purpose |
|---|---|
| 001–002 | Provider operations and historical reviewed offers. |
| 003–005 | Recommendation runs, draft snapshots, provider assets and research runs/heads/budgets. |
| 006 | Optional runtime-role grants/policies; role provisioning is external. |
| 007 | Identify stage. |
| 008 | Configurable daily limits. |
| 009 | Introduction stage. |
| 010 | Safe operation error categories. |

Successful stage caches generally last 24 hours; refresh is explicit. Rate limits, request bounds and provider deadlines remain active. Daily admission caps are opt-in. Usage represents recorded admissions/tokens, not a billing invoice; missing usage stays unknown. Safe diagnostics retain timing, usage, model and prompt provenance. Raw credentials and provider error bodies are not projected.

Database TLS verifies CA and hostname. A rollback failure destroys the checked-out client rather than returning it to the pool, while preserving the original failure. HTTP responses disable framework disclosure and set content-type, framing, referrer and permissions protections; production adds HSTS. The CSP restricts framing, base URLs and objects; it is not a complete script policy.

`/api/offers` returns 410; historical offers and `createReviewedDraft` remain compatibility/operator paths. Active generation needs no separate pre-draft approval record. See [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) for remaining scale, privacy and correctness boundaries.
