# Phase 0: integration discovery

Updated: 9 October 2026. **Core discovery verified; priced content/UI acceptance remains open.** Proposales scope, empty library, draft creation/retrieval/metadata search, durable database operations and DeepSeek structured generation have been exercised. Historical entries below retain the earlier checks; the latest evidence supersedes their pending status.

## Environment and dependency candidates

Local Node.js: **24.19.0**, observed directly. The public npm registry returned these versions/constraints on 9 October 2026. Next/React remain candidates for the next slice. AI SDK 7.0.135, its DeepSeek provider 3.0.63 and Zod 4.6.5 are now installed and tested with Node 24.19.0; pg 8.23.1 replaces the earlier Postgres.js candidate. Exact resolved dependencies are in package-lock.json.

| Package | Candidate | Relevant metadata |
|---|---|---|
| `next` | 16.4.0 | Node >=20.9.0; React 19 accepted |
| `react` | 19.3.0 | Satisfies inspected Next peer range |
| `ai` | 7.0.135 | Node >=22; Zod ^3.25.76 or ^4.1.8 |
| `@ai-sdk/deepseek` | 3.0.63 | Node >=22; Zod ^3.25.76 or ^4.1.8 |
| `zod` | 4.6.5 | Satisfies inspected peer ranges |
| `postgres` | 3.4.9 | Node >=12 |

The inspected constraints accept local Node. Full dependency resolution, provider interoperability, structured-output behaviour and deployed runtime remain unverified. Select the exact DeepSeek model after checking account availability and current provider support; do not assume older aliases still work.

## Account capability matrix

“Documented” means an official reference describes it, not that permission or successful operation has been verified for this account.

| Capability | Documentation finding | Account result / next check |
|---|---|---|
| Company scope | `GET /v3/companies` | Pending key. Read ID/currency; never log inbox tokens or full responses. |
| Content library | `GET /v3/content` scoped by company | Pending. Confirm product/variation IDs and empty-library behaviour. |
| Create content | `POST /v3/content`; docs require a valid image | Pending. One fictional item using an owned asset; retain IDs. |
| Create draft | `POST /v3/proposals` creates draft; product block `content_id` maps to variation ID | Pending. Verify required fields, money/billing mapping and unsent UI state. |
| Read/edit draft | Retrieval and `PATCH /v3/proposals/{uuid}` documented | Pending. Verify status/editor URL and edit restrictions. |
| Reconciliation | Proposal `data` and `GET /v3/proposal-search` documented | Pending. Verify round-trip and result shape; no-match does not prove write failure. |
| Native idempotency | No guarantee established in reviewed docs | Unknown. Keep local dedupe and explicit uncertain-write recovery. |
| Publish/send | No supported public API route located in reviewed docs | Unknown, not proven absent. Baseline: manual provider UI sending. |
| Webhooks | Connection/powerup and status-event docs exist | Pending availability/authentication/event IDs/order/retries. Optional. |
| DeepSeek via AI SDK | Provider integration documented | Pending key/model. Bounded synthetic structured-output check plus usage observation. |
| Tavily | Credit-based search; free tier lists 1,000 monthly credits | Pending account. Verify result/usage shape. Live research follows examples. |
| Supabase SQL | Transaction pooler supports serverless use; disable prepared statements | Dedicated project configured; TLS/authentication and read-only transaction verified with pg 8.23.1. Scoped schema access, persistence/reconnect and concurrent operations remain pending. |
| Vercel | Hosting required by case | Pending deployment. Verify runtime, duration, environment and database access. |

If optional sending/webhooks are unavailable, continue the draft workflow and record the limitation. If draft/content creation is blocked, investigate supported templates/existing-content alternatives while local work proceeds. A simulation does not satisfy the final real integration acceptance gate.

## Live result recording

Record date, operation, success/error category, HTTP status, redacted schema observation, elapsed time, attempts and conclusion. Never persist credentials, connection strings, full account payloads, customer content or raw provider headers in shared evidence. Operational IDs may be retained privately for reconciliation; public evidence uses redacted examples.

Read operations precede writes. Fictional writes must have a durable local operation record and retain returned IDs. An ambiguous write stops for reconciliation rather than repeating creation. Sending probes require an explicitly selected test recipient and authorised sending scope.

Phase 0 closes when real-account evidence establishes the minimal draft path and compatible model path, or a precise limitation and workable supported alternative are recorded. Public-doc research alone does not close this gate. Optional Tavily/webhook checks may remain pending without delaying the example workflow.

## Sources

[Companies](https://docs.proposales.com/api-reference/companies/list), [list content](https://docs.proposales.com/api-reference/content/list), [create content](https://docs.proposales.com/api-reference/content/create), [create draft](https://docs.proposales.com/api-reference/proposals/create), [patch draft](https://docs.proposales.com/api-reference/proposals/patch-draft), [search proposals](https://docs.proposales.com/api-reference/proposals/search), [connections](https://docs.proposales.com/connections), [status webhook](https://docs.proposales.com/webhooks/proposal-status-update), [manual sending](https://help.proposales.com/en/articles/5665659-send-a-proposal). SDK/database references are in [the design](ARCHITECTURE.md#primary-references). Package versions were read from the public npm registry.

## Driver compatibility follow-up — October 9

The Data API warning shown during project creation concerns supabase-js/HTTP data access. Our server will use the PostgreSQL protocol through the transaction pooler with DATABASE_URL, independently of the Data API. Here “direct SQL access” does not mean selecting Supabase's separate Direct connection endpoint.

New documentation evidence: Supabase's Postgres.js guide warns that default query pipelining can hang or mismatch results through the shared transaction pooler, and that max_pipeline: 0 breaks transactions. Earlier Postgres.js selection is therefore provisional; prepare: false alone does not settle compatibility. Evaluate node-postgres (pg) with pipelining disabled and unnamed parameterised queries before installation; verify transaction/reconnect/concurrency behaviour against the real project. No driver runtime compatibility or account connection has been tested.

Sources: https://supabase.com/docs/guides/database/postgres-js ; https://node-postgres.com/features/pooling ; https://node-postgres.com/features/queries .

## Database probe — October 9

Saved URI now passes format checks, with password placeholder/brackets removed. Installed a temporary pg client under /tmp/proposales-db-check (no case dependencies added). Two connection attempts with TLS certificate verification enabled, including one with system CA trust, stopped at SELF_SIGNED_CERT_IN_CHAIN. Authentication and SQL execution remain unverified; no tables/data changed. Next: obtain the project's server root CA certificate from Supabase Database Settings → SSL Configuration, configure explicit CA trust and retry the read-only transaction. Do not disable certificate verification. Source: https://supabase.com/docs/guides/platform/ssl-enforcement .

## Verified database connection — October 9

Located user-supplied prod-ca-2021.crt in the case folder and used it as explicit trusted CA with TLS verification enabled. Temporary node-postgres (pg) 8.23.1 probe successfully authenticated, executed BEGIN READ ONLY, SELECT 1 with transaction_read_only verification, and ROLLBACK. Total observed probe duration: 607 ms (one successful sample, not a benchmark). No tables created and no data changed. Credentials/URI were not printed.

This verifies initial connectivity and a read-only transaction through the configured transaction pooler. It does not establish application permissions, concurrent-operation correctness, reconnect behaviour or deployed Vercel access. Application dependency/configuration is not installed or wired yet; configure the same CA explicitly in the eventual server DB module. Driver choice can now proceed with pg, subject to remaining integration tests.

## Implemented discovery results — October 9

| Check | Observed result |
|---|---|
| Company scope | HTTP 200; one matching Metascalers company; EUR; scope saved locally |
| Library | HTTP 200; zero items |
| Draft creation/retrieval | One description-only synthetic draft; retrieved status `draft`, no recipient, zero blocks |
| Metadata/search | Operation reference survived retrieval; filtered search returned the known draft |
| Repeat invocation | Reused confirmed operation/provider UUID; no second creation dispatch |
| Database | Additive private-schema migration; concurrent admission from two pools, reconnect and terminal-state protection passed |
| DeepSeek | Model-list HTTP 200; selected `deepseek-flash`; one real schema-valid/evidence-supported synthetic result |
| Usage observation | 181 input tokens, 23 output tokens, 1,216 ms model call; n=1, not a quality/latency benchmark |
| Structured output | Provider compatibility mode injects schema instructions; local schema validation still required |

The core draft path is available. Content creation and monetary/billing mapping remain open: the library is empty and documented content creation requires an owned public image. The next slice will host a synthetic service asset and verify real priced blocks, rather than claim the description-only draft is a finished offer. Draft patching, webhook authentication/delivery and public deployment are not tested. No email was sent.

## Final foundation review — October 9

Independent read-only review completed. Three findings fixed with five observed failing regressions: sanitise migration initialisation; reject malformed/unverified nonempty content; fail recovery discovery when metadata search does not find the known draft. Also recover a committed confirmation after its acknowledgement is lost. Latest offline suite: 27/27 passed; TypeScript passed. The earlier isolated real-database check passed 1/1. These counts apply to this CLI foundation, not the later application UI or live research.

Phase 0 foundation is ready for the example workflow. Priced-content mapping remains open and must be closed before the example workflow's final acceptance gate.
