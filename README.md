# Fieldwork — from a business name to a proposal you can send

Fieldwork is a small tool for a digital agency (here, Metascalers) built on the Proposales API. An operator enters a business name and place. Fieldwork researches the business from public sources, suggests services from the agency's catalogue with the evidence behind each one, and creates an unsent draft proposal in Proposales. A person reviews and sends it there.

**Live:** https://proposales-case.vercel.app (access code supplied with the submission)

## Try it

1. Open the app and enter the access code. Without it, the two fictional examples are still viewable.
2. **New research:** enter a business name and place, in any country. Confirm which business the sources describe and its website; the report and suggested services follow, each tied to its sources.
3. **Adjust the scope:** keep, remove or add services, change quantities, or make a service optional. The bar at the bottom shows the totals.
4. **Create proposal:** review the drafted introduction and, optionally, add a recipient. This creates an unsent draft in Proposales; nothing is emailed.
5. **Proposals:** each proposal's status is read live from Proposales (draft, sent, accepted…). An accepted proposal links to its PDF. Sending happens in Proposales; the editor links need the Metascalers account.

## How it works

```
name + place ──► Tavily search ──► identify (AI quotes, code verifies) ──► operator confirms business + website
                                                                                     │
Proposales draft ◄── code builds + verifies ◄── operator adjusts ◄── AI selects ◄── AI report (cited sources)
       │                (prices, totals)            scope             services
       └──► operator reviews and sends in Proposales; status read back into Fieldwork
```

The split of responsibilities is the core idea:

- **AI suggests and explains.** It identifies the business with quotes from the sources, writes a report, picks services from a fixed catalogue and drafts an introduction. Every model output is schema-validated, and claims must point at sources.
- **Code decides what is allowed.** It verifies the AI's quotes against the sources (in any language), rejects services that are not in the catalogue or whose prerequisites are missing, and calculates every price and total in integer cents. The model never sets a price.
- **A person approves.** The operator confirms the business, adjusts the scope, and reviews the actual draft in Proposales before sending. Fieldwork never sends.

## Design decisions worth knowing

- **One write, verified.** Creating a Proposales draft is an external write with no idempotency key. Each creation is admitted once in Postgres under a deterministic key. If the response is lost, the outcome is recorded as unknown and reconciled by searching Proposales for the key; it is never blindly retried. After creation, the draft is read back and compared field by field with what was sent.
- **Saved snapshots are immutable.** What was proposed (scope, prices, report, layout version, pinned image and cover IDs) is saved before the write and hashed. Changing the layout creates a new composition version (`proposal-2` … `proposal-5`); existing proposals keep their exact payload.
- **Postgres as cache, admission and audit log.** Paid stages (search, identify, report, selection) are keyed by a hash of their inputs. The same row deduplicates concurrent requests, caches the result for 24 hours and records inputs, versions, usage and failures.
- **Provider failures name their cause.** Tavily, DeepSeek and Proposales errors are mapped to safe codes ("search credits used up", "AI balance empty"), and the screen says what to do.
- **The proposal reads like a proposal.** Services are grouped by category, monthly services share one section, and the introduction states the one-time and monthly investment, because Proposales adds them into one total. The cover comes from the agency's Proposales template.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the decision history in [docs/IMPLEMENTATION-LOG.md](docs/IMPLEMENTATION-LOG.md), and known limits and next steps in [docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md).

## Stack

Next.js 16 (App Router) and TypeScript on Vercel; Vercel AI SDK with DeepSeek; Tavily for search; Supabase Postgres through the transaction pooler; the Proposales REST API.

## Run locally

Use Node 24 (`.nvmrc`). Copy `.env.example` to `.env.local` if it does not exist, and fill in the server-only values:

| Variable | Purpose |
|---|---|
| `PROPOSALES_API_KEY`, `PROPOSALES_COMPANY_ID` | Proposales access and the company to work in |
| `PROPOSALES_TEMPLATE_UUID` | Optional: the template whose cover new proposals use |
| `PROPOSAL_COMPOSITION` | Optional: `proposal-4` or `proposal-3` to opt out of the current layout |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Model access through the AI SDK |
| `TAVILY_API_KEY` | Live research (not needed for the examples) |
| `DATABASE_URL`, `DATABASE_CA_PATH` or `DATABASE_CA_PEM` | Supabase Postgres, with TLS verification |
| `APP_ORIGIN`, `REVIEWER_ACCESS_CODE`, `SESSION_SECRET` | Exact browser origin for writes, the demo code, and the session signing key |
| `DAILY_LIMIT_*` | Optional daily caps per paid stage |

```sh
nvm use
npm ci
npm run db:migrate      # applies each migration once, recorded in a ledger
npm run dev             # http://127.0.0.1:3000; set APP_ORIGIN to match
```

New proposals use five category entries in the Proposales content library; [docs/PROPOSAL-CATEGORIES.md](docs/PROPOSAL-CATEGORIES.md) describes the one-time import.

## Tests

```sh
npm test            # offline unit and contract tests
npm run typecheck
npm run test:db     # integration tests in an isolated, randomly named schema, removed afterwards
```

Provider calls are faked in the offline tests. AI quality is evaluated separately in [evals/](evals/REVIEW.md).

## Repository map

| Path | What it holds |
|---|---|
| `src/app` | Page and API routes |
| `src/components` | The workbench UI |
| `src/domain` | Catalogue, pricing, reports, identity checks, proposal grouping (no I/O) |
| `src/server` | Services, persistence, admission, workflow and access |
| `src/server/providers` | Proposales, Tavily and DeepSeek clients and the proposal composition |
| `src/prompts` | Versioned prompt sections |
| `db/migrations` | Additive SQL migrations |
| `evals` | AI evaluation cases and results |
| `docs` | Architecture, decisions and operator notes |
