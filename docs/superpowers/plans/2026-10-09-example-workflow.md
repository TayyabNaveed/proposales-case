# Example-to-Draft Workflow Implementation Plan

> **Superseded for future work on 9 October 2026.** The implemented approval-first slice is historical. Continue with [AI-selected service modules and drafts](2026-10-09-ai-service-proposals.md): fixed modular pricing, real AI selection and one review in Proposales. Preserve existing data.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an evaluator inspect a synthetic business report, edit a deterministic service offer, approve its exact version and create a real unsent Proposales draft through a protected workflow.

**Architecture:** One Next.js application; public synthetic examples use no paid provider calls. Server-only routes validate catalogue/report references, persist immutable approved snapshots and use the existing operation store before external creation. Reviewer access protects approvals and account-backed writes.

**Tech Stack:** Next.js/React/TypeScript on Node 24; Zod; pg/Supabase; existing Proposales adapter. AI SDK/DeepSeek remain available, but live research is the following slice.

**Spec:** [Technical design](../../ARCHITECTURE.md)

## Global Constraints

- Example data is synthetic and visibly labelled; no customer/private product data or source imports.
- Currency EUR, matching verified company scope. Prices are illustrative, not confirmed commercial terms.
- Money uses integer minor units; separate one-time and monthly totals. Quantity bounds 1–10; at most 3 service items.
- Catalogue owns deliverables, exclusions, unit price, billing interval and tax treatment. Neither browser nor model can invent commercial fields.
- Review binds to exact report/catalogue/offer version. Material edits require new approval.
- At most 1 retry for eligible safe reads; never automatically repeat uncertain writes.
- Drafts stay unsent. No email address or real contact is required for synthetic examples.
- No unrestricted public account-backed or paid-model endpoints.
- Keep private preparation outside this folder; no remote/deployment setup in this slice.

## Review Focus

1. A modified browser payload contains invented prices or service IDs: server must reject/reconstruct from catalogue (Task 1).
2. User edits an approved offer: creation must reject the stale version (Tasks 2/4).
3. Repeat/concurrent creation or an unknown response: reuse one durable operation and show actionable status (Tasks 2/4).
4. A visitor invokes a write route directly or from another origin: reject before any provider call (Task 3).
5. Provider amounts/billing differ from reviewed snapshot: show verification failure; do not claim the offer was faithfully created (Tasks 4/5).

## Files and interfaces

- `src/domain/catalogue.ts`: immutable demo catalogue `catalogueVersion`, service definitions and billing rules.
- `src/domain/reports.ts`: three labelled fixtures, source/finding IDs and recommended catalogue items.
- `src/domain/offers.ts`: schema validation, reference checks, integer totals, canonical snapshot/hash.
- `src/server/offers.ts`: immutable approval storage/retrieval; no browser-controlled pricing.
- `db/migrations/002_offers.sql`: approved snapshots with unique request/version identifiers in private case schema.
- `src/server/access.ts`: expiring signed reviewer session and same-origin write checks.
- `src/server/workflow.ts`: approved snapshot → operation claim → verified Proposales draft.
- `src/server/providers/proposales.ts`: extend verified content mapping/create/blocks; preserve safe transport behaviour.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`: public explanation and example workbench.
- `src/components/ExampleWorkbench.tsx`: accessible evidence → services → review → draft states.
- `src/app/api/session/route.ts`, `src/app/api/offers/route.ts`, `src/app/api/drafts/route.ts`: narrow server entry points.
- `public/service-card.svg`: newly authored synthetic image; provider content probe needs an owned public URL serving it or an existing owned asset.
- `tests/offers.test.ts`, `tests/access.test.ts`, `tests/workflow.test.ts`, `tests/offers.integration.ts`: domain, access, failure and real persistence checks.

Interfaces to finalise as named below before implementation:

```ts
type ExampleReport = {
  id: string; version: 1; mode: 'synthetic'; businessName: string;
  findings: { id: string; claim: string; kind: 'observed' | 'inferred' | 'unknown'; evidenceIds: string[] }[];
  evidence: { id: string; label: string; excerpt: string; synthetic: true }[];
  recommendations: { serviceId: string; findingIds: string[]; explanation: string }[];
};
type Selection = { serviceId: string; quantity: number };
type OfferItem = {
  serviceId: string; title: string; quantity: number; unitPriceMinor: number;
  billing: 'one-time' | 'monthly'; deliverables: string[]; exclusions: string[];
  findingIds: string[];
};
type OfferInput = { exampleId: string; catalogueVersion: string; selections: Selection[] };
type OfferSnapshot = {
  version: 1; reportId: string; catalogueVersion: string;
  currency: 'EUR'; items: OfferItem[];
  oneTimeMinor: number; monthlyMinor: number;
  taxLabel: string; demo: true;
};
type ApprovedOffer = {
  id: string; requestId: string; reviewerId: string; snapshot: OfferSnapshot;
  snapshotHash: string; approvedAt: string;
};
type DraftOutcome =
  | { state: 'confirmed'; providerId: string; editorUrl: string }
  | { state: 'claimed' | 'unknown'; message: string };
buildOffer(input: OfferInput): OfferSnapshot;
approveOffer(requestId: string, snapshot: OfferSnapshot, reviewerId: string): Promise<ApprovedOffer>;
createReviewedDraft(approvalId: string, reviewerId: string): Promise<DraftOutcome>;
```

`ApprovedOffer` includes immutable snapshot/hash and approval timestamp/identity. `DraftOutcome` is confirmed with provider ID/editor URL, in progress, or unknown with reconciliation instructions. Never return raw provider objects or credentials.

## Task 1: Evidence and deterministic offer domain

- [ ] Write tests for invented/missing service, invalid quantity, duplicate items, mismatched catalogue version, unknown finding IDs and mixed billing totals. Observe RED, then implement three synthetic fixtures and the catalogue.
- [ ] Use illustrative one-time website foundation (€1,200), enquiry-flow improvement (€400) and monthly discoverability foundations (€180/month); label prices clearly. No guaranteed ranking or delivery dates. Demo tax policy: prices excluding tax, tax requires confirmation before commercial sending.
- [ ] Implement `buildOffer` with server-authoritative service terms and integer totals. Reject unknown inputs and bound copy rather than accepting browser HTML.
- [ ] Only offer services with report-supported recommendation references. Empty selections support dismissal; approval requires at least one selected service. Missing/ambiguous identity cannot automatically justify a website sale.
- [ ] Pass domain tests and TypeScript. Document the distinction between a grounded finding, an interpretation and an unknown.

## Task 2: Durable approvals and creation admission

- [ ] Write integration tests for one immutable approval per request ID, payload conflict, fresh approval after edits, concurrent creation and reconnect. Use an isolated test schema.
- [ ] Add additive approval migration. Save snapshot/hash, report/catalogue versions and reviewer identity; use parameterised SQL.
- [ ] Bind operation keys to company + approval ID + snapshot hash. Read the stored approval before provider creation; never accept a browser-supplied provider payload.
- [ ] Reuse confirmed/in-progress/unknown operation state. No automatic reclaim/recreate after a timeout. Tests include committed confirmation with lost acknowledgement.
- [ ] Pass offline workflow tests and isolated real-database integration checks.

## Task 3: Reviewer access and server routes

- [ ] Write tests for invalid/expired/tampered session, direct unauthorised writes, cross-origin writes and repeated login failures. Observe RED before implementation.
- [ ] Add server-only `REVIEWER_ACCESS_CODE` and `SESSION_SECRET` configuration. Local values are generated privately; never committed or exposed in public client variables.
- [ ] Implement expiring signed session cookie: HttpOnly, SameSite Strict, Secure in production. Constant-time credential comparison; reject unexpected Origin for writes.
- [ ] Bound login attempts using persisted access counters and opaque hashed client identifiers. Configure trusted proxy handling explicitly before deployment.
- [ ] Routes validate input, authorise first and emit safe error categories. Public examples remain available without login or provider requests.
- [ ] Keep database role least-privileged in the deployment plan; current operator/admin connection is not automatically suitable for public routes.

## Task 4: Usable example workbench

- [ ] Design one cohesive responsive page: calm dark-ink/cream palette, evidence-first report, service selection with separate recurring totals, explicit review summary and final draft status. Avoid generic KPI cards or unverified performance scores.
- [ ] Show three examples: a business with explicitly absent website, an existing website with an enquiry-flow issue, and insufficient/ambiguous evidence where no proposal may be appropriate.
- [ ] Any edit invalidates displayed approval; accessible labels, keyboard focus and loading/error states remain visible.
- [ ] “Approve offer” persists the exact reviewed snapshot; “Create unsent draft” is a separate deliberate action. Display provider editor URL as authenticated editor, never published client view.
- [ ] For unknown creation show reconciliation guidance and no automatic retry button. Repeated clicks reuse the same approval/operation.
- [ ] Verify desktop/mobile, keyboard flow, invalid-input states and visitor access restrictions with local browser checks.

## Task 5: Real content and priced-block fidelity

- [ ] Read full content/block contracts and probe one owned public image URL. If no owned public URL is ready, keep local work moving and record this gate as pending; do not fabricate provider content success.
- [ ] Create/reuse labelled synthetic content through persisted seed operations. Verify product ID versus variation ID with actual response and retrieval.
- [ ] Implement server mapping from approved catalogue items to provider blocks. Record amount units, quantity, tax and recurring-billing fields from actual observed contracts.
- [ ] Create one reviewed synthetic offer draft; retrieve and compare its amounts/items against the approved snapshot, then inspect the resulting dashboard manually.
- [ ] If provider recurring billing is unsupported, choose an explicit supported representation and label its limitation; no silent arithmetic substitution.
- [ ] Confirm no recipient notification/email occurred. Retain safe local operational IDs for reuse/reconciliation.

## Task 6: Review, handover and next slice

- [ ] `npm test`, `npm run typecheck` and `npm run build` pass on Node 24; isolated persistence tests pass when configured.
- [ ] Review access boundaries, payload reconstruction, stale approvals and uncertain-write states. Fix material findings with regression tests.
- [ ] Update README, architecture/capability ledger and code walkthrough to actual behaviour. Record remaining gates explicitly.
- [ ] Prepare the live research/caching/evaluation slice using the same report contract; no open-ended agents.

## Exit and recovery

The slice is complete when the public example/review flow is usable, authorised real creation persists/reuses its operation, and provider priced blocks match the reviewed snapshot. A description-only draft does not close priced-block fidelity. No deployment or commercial sending is implied.

Migrations are additive. Do not reset existing provider records or production tables. If interrupted, retain approval/operation rows and resume status/reconciliation; never delete a row to force an external retry.

Self-review: covers approved examples-first scope and the five review concerns. Exact browser/source IDs and provider billing mapping are verified during implementation rather than guessed. The owned public-image dependency is the only anticipated external input for priced content.


## Implementation status — 9 October 2026

Tasks 1–3 have local implementations and passing domain/access/persistence checks. Task 4 is usable through approval, with real creation explicitly gated. Task 2's exact-snapshot creation boundary is tested through an injected provider; the priced live adapter is not wired. Task 5 is pending an owned public image plus live content/billing verification. Task 6 has passing local checks and independent review, but the full slice exit condition remains open. See IMPLEMENTATION-LOG.md and WALKTHROUGH.md for evidence and rulings. Nothing deployed or uploaded.
