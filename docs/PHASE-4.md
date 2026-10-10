# Phase 4: complete report-to-draft workflow

Two synthetic examples now run through authenticated AI service selection, optional quantity/scope adjustments, immutable server-priced generation snapshots, real unsent Proposales drafts and one human review in the provider editor.

## Try it

Open the local workbench. Public results are labelled recorded AI outputs. Enter the configured demo access code, then choose **Get AI recommendations**. A valid scope-owned cached result is reused; **Run AI again** explicitly requests a fresh run. Remove modules, reduce quantities or switch core/optional status subject to prerequisites. Four totals distinguish one-time/monthly and core/optional charges. Click **Generate Proposales draft**, then open the actual provider editor to review scope, prices, quantities, missing information and recipients before manually sending.

Authentication enables paid actions; it does not approve a proposal. Prices are illustrative, excluding tax. Creation assigns no recipient and sends no email. Existing proposals and historical approvals are preserved. The retired approval API returns 410.

## Persistence and recovery

The server owns reports, catalogue prices, AI rationale and evidence references. Browser adjustments contain only supported IDs, quantities and dispositions. Current input/catalogue/model/version hashes and expiry are checked before snapshot admission. Scope plus request UUID identifies one immutable snapshot; changed payloads conflict.

A provider operation is durably claimed before its one create call. UUID and trusted API-returned editor URL survive reconnect. Actual retrieval independently verifies selected blocks, quantities, scope, commercial fields, native monthly billing and optional defaults. Fidelity warnings retain the existing identity/link instead of regenerating.

A saved browser request remains locked across reloading, failed recommendation reads and reselecting the same example. **Check draft status** reads/reconciles existing state only. **Retry saved request** explicitly reuses the identical UUID/payload; an admitted unknown operation never resends creation. A missing status response does not authorise a new UUID. A separate version is offered only after provider identity is known. Definitively rejected first requests release controls; transport uncertainty preserves identity.

## Limits and evidence

Signed one-hour HttpOnly sessions, exact write origin, 8KiB streamed JSON limit, scoped reads, 30 protected requests/action/minute, 20 AI admissions/day and 10 snapshot versions/day bound the demo. Provider keys stay server-side. Deployment still requires a least-privilege database role and production identity/rate-limit review.

Verified 95 offline tests, TypeScript and production build; isolated actual database checks (4) and local HTTP guards (1). A real fresh AI selection created one four-service recipient-free draft: EUR1,800 core once, EUR80 core monthly. Retrieval fidelity passed, repeat POST and reconnect returned the same UUID/editor URL. No automatic PATCH. Visual provider acceptance remains manual; repeated graphics are intentionally deferred.

One fresh independent review found three UI recovery gaps, fixed before completion. The reviewer ran 30 focused tests; live database/provider/browser evidence was verified by the implementer separately.

`node --import tsx scripts/probe-workflow.ts` reads the existing private smoke-test record and verifies status. Initial `--create` is an explicit account-write option only when no record exists; it is not an automatic retry command. Use Node24.

Next phase is bounded live research. Research, sending, webhooks, deployment and repository sharing are outside this phase.

Browser verification passed: demo login and session persistence after reload, cached authenticated AI selection with generation enabled, keyboard prerequisite guard, desktop and 375px mobile layout without horizontal overflow. Temporary QA code was process-only and restored to actual configuration. Provider editor required its own login; visual acceptance remains manual.
