# Report to reviewed proposal

A focused proof of concept: turn a sourced business report into an evidence-backed service recommendation, review its scope and price, and create an unsent Proposales draft.

**Status — 10 October 2026:** The core through Phase5 and the A–D product refinement are implemented locally. Research is the default journey, with deliberate analysis progressing across separately protected source/report/selection APIs. Two fictional examples teach the same flow. One human review/edit happens in Proposales before manual sending. Final refinement verification is recorded in [QUALITY-REFINEMENT](docs/QUALITY-REFINEMENT.md); deployment remains pending.

- [How this project is built](docs/WORKFLOW.md)
- [Current spec: guided proposal flow](docs/specs/2026-10-11-guided-proposal-flow.md)
- [Technical design and scope](docs/ARCHITECTURE.md)
- [Current implementation plan: AI service selection and real drafts](docs/superpowers/plans/2026-10-09-ai-service-proposals.md)
- [Phase 2 API verification and operator commands](docs/PHASE-2.md)
- [Phase 3 recommendation evidence and operator commands](docs/PHASE-3.md)
- [Evaluation explanations and limits](evals/REVIEW.md)
- [Phase 0 verification results](docs/PHASE-0.md)
- [Phase 0 implementation plan](docs/superpowers/plans/2026-10-09-phase-zero.md)

Live research and the example-report → AI recommendation → real draft path are implemented. Examples are explicitly fictional; live results retain sources, timestamps and uncertainty. Read the current architecture and prompt documentation before using historical implementation plans.

Selected stack: Next.js/TypeScript, Vercel AI SDK with DeepSeek, Tavily, Supabase Postgres and Proposales, hosted on Vercel. AI suggests and explains; code validates service choices and calculates prices; a person reviews the actual unsent draft in Proposales before manually sending. Authorised access permits generation and is separate from commercial approval.

## Local configuration

Copy `.env.example` to `.env.local` **only if the local file does not already exist**, then configure server-only credentials. Never commit the local file or put these values in `NEXT_PUBLIC_*` variables.

| Variable | Purpose |
|---|---|
| `PROPOSALES_API_KEY` | Server-side Proposales access |
| `PROPOSALES_COMPANY_ID` | Company scope selected after listing accessible companies |
| `DEEPSEEK_API_KEY` | Direct DeepSeek access through AI SDK |
| `DEEPSEEK_MODEL` | Exact model selected after account/output compatibility checks |
| `TAVILY_API_KEY` | Live research; not required for synthetic examples |
| `DATABASE_URL` | Dedicated Supabase transaction-pooler Postgres URI with database password |

The SQL connection does not use a Supabase publishable/anon API key. Browser database access is not planned. Use Node 24 (see `.nvmrc`). The connection requires the Supabase CA certificate through `DATABASE_CA_PATH` (local file, defaults to `prod-ca-2021.crt`) or `DATABASE_CA_PEM` (hosting environment). TLS verification stays enabled.

This directory is the standalone project boundary. Its eventual repository must contain only reviewed case code, synthetic fixtures and technical documentation. It must run without parent-directory imports, files, credentials or history. No repository remote or deployment has been configured.

## Run the implemented discovery slice

```sh
nvm use
npm ci
npm test
npm run typecheck
npm run probe -- companies
npm run probe -- content
npm run probe -- model
```

Unit tests are offline. The model probe makes one bounded, billable provider request using synthetic evidence. Read probes use the configured account; outputs omit credentials and private account payloads.

For a dedicated case database, apply the additive migrations with `npm run db:migrate`. `npm run test:db` creates an isolated randomly named test schema, checks concurrent admission/reconnect behaviour, and removes only that schema.

`npm run probe -- draft` deliberately creates **one unsent, recipient-free, description-only discovery draft**. A durable operation key makes repeat runs reuse its result. `npm run probe -- verify-draft` only retrieves/verifies it. Private IDs are saved under ignored `private/`. The command does not create priced content or send email. Unknown/unfinished operation outcomes require reconciliation; do not delete operation rows to force another attempt.

The CLI is an operator tool. The UI uses signed demo sessions and exact-origin checks for AI calls and real account-backed unsent draft creation. **Known limitation:** the hosted app connects with the Supabase project role, like migrations and operator scripts. For a case project that was a deliberate choice. A production setup would give the app its own narrower role. `db/migrations/006_app_role.sql` prepares that role, `case_app`, limited to reading, inserting and updating `case_workflow` rows. It has no effect unless the role is created.

## Current evidence and limits

- Provider contract, write-failure and model-support tests; real database concurrency/reconnect check.
- Draft retrieval confirms `draft`, no recipient and preserved operation metadata. Filtered search finds it; this does not establish immediate consistency after every write.
- `deepseek-flash` is an account-supported alias, not an immutable model snapshot. Record evaluation dates and recheck quality when it changes.
- AI SDK uses schema instructions in a compatibility mode for this provider; runtime schema validation and evidence checks remain required.
- Priced blocks and synthetic service-selection cases are verified. Live report generation is verified; no deployment, complete factuality evaluation, delivery or webhook integration yet.


## Try the local workbench

```sh
nvm use
npm run db:migrate
npm run dev -- --port 3001
```

Open http://127.0.0.1:3001. `APP_ORIGIN` must exactly match the browser origin. Enter the locally configured `REVIEWER_ACCESS_CODE` to unlock demo actions, then get AI recommendations, tailor supported services and generate a draft. Review the actual proposal in Proposales before manually sending. The code and `SESSION_SECRET` stay server-side in `.env.local`. Public recorded examples require no credentials or provider calls. Sessions last one hour; expired access restores login. Saved uncertain requests retain their UUID across reload and explicit retries. HTTPS cookies are required except for explicit loopback origins.

The local server may already be running on port 3001. Avoid starting a second instance on the same port. For a production build, use `npm run build` then `npm run start -- --port 3001`.

Login allows five attempts per minute per visitor on Vercel, where the platform sets `x-forwarded-for`, plus a global cap of 30 per minute. Elsewhere forwarding headers are not trusted, and a single global limit of five applies. Visitor addresses are stored only as keyed hashes. This is a single shared demo reviewer identity, not a production multi-user identity system.

`npm run test:db` verifies operation/snapshot/recommendation/asset/access persistence in isolated schemas. `npm run test:http` checks the running local app without model or proposal creation. See [code walkthrough](docs/WALKTHROUGH.md).

## Implemented workflow

Report → AI-selected fixed-price service modules → unsent Proposales draft → one human review/edit in Proposales. Historical approval rows remain preserved; `/api/offers` is retired. Fixed prices are illustrative case rates. Live research reuses this working example path.

For live research, unlock access beside the first action, enter business name/location/optional website and choose **Analyse business**. The report appears before service suggestions complete. Continue/retry resumes saved stages deliberately; reopening and tab navigation only read saved work. **Create proposal** creates an unsent draft for **Open in Proposales**. Web Locks and browser storage are required for safe local proposal admission. See [current walkthrough](docs/WALKTHROUGH.md), [prompt versions](docs/PROMPTS.md) and [research limits/evidence](docs/PHASE-5.md).
