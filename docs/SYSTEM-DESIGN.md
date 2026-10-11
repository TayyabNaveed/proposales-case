# System design boundaries

This is a bounded agency demo with shared signed access. The following work is deferred rather than hidden by demo-specific patches.

| Area | Current boundary and next decision |
|---|---|
| List and usage queries | Review scope/date indexes using measured query plans before scaling. The proposal list has a 20-row cap and no pagination. |
| Privacy and retention | Define retention/deletion for business research, client notes, recipients and diagnostics. Scope checks do not replace a data-access/deletion policy. |
| Database relationships | Provider-operation keys encode snapshot identity but have no snapshot foreign key. An explicit relationship would simplify reconciliation and auditing. |
| Usage and cost | Recorded admissions and tokens are visible; provider invoice costs and missing usage are not reconstructed. Cost columns need a provider/pricing policy. |
| Interrupted runs | Explicit refresh handles stale running stages. A scheduled sweep and shared timing constants would improve operational recovery. |
| Provider status | Reads have per-request bounds and limited concurrency, but the list needs an overall deadline. Webhook activation and reconciliation need verification before replacing on-demand reads. |
| International identity | Short location strings can match inside unrelated words. A general fix needs fresh multilingual identity evaluation rather than a location blacklist. |
| Email | Internationalised domains and provider recipient compatibility need explicit handling and tests. |
| Canonical hashes | Locale-dependent key ordering is historical behaviour. Changing it requires versioning and compatibility with saved snapshots/operations. |
| Sessions | Signed sessions expire; individual revocation and tenant-specific identities are not implemented. |
| Asset preparation | Category mappings and the template cover are read sequentially. Independent reads could run in parallel without changing snapshot pins. |
| Catalogue and prices | Services and prices are constants in `src/domain/catalogue.ts`; changing one needs a deploy, and prices are adjusted per proposal in the Proposales editor. An in-app catalogue would keep services and default prices in Postgres, with a change history, behind a separate admin permission (the shared access code should not edit prices for everyone). Each proposal would pin the price version it used, and a per-proposal price could override a default without changing it. Suggestion identity currently hashes the whole catalogue, prices included, although the model never sees prices; it should hash the price-free catalogue, so a price change does not make saved suggestions stale. |
| Proposales contacts | Proposales keeps one contact per email. A recipient email that already belongs to another company's contact keeps that contact's company, not the one sent (observed 11 October). Read-back flags this as a recipient mismatch, and the operator corrects it in Proposales. Looking up or updating the contact before creation needs API verification first. |
| Evidence semantics | The summary absence check is English-specific. Source quotation/schema checks cannot prove semantic truth or freshness. |

Questions to resolve before treating this as a multi-tenant production system:

1. What is a tenant, and which identity owns each research run and proposal?
2. How are memberships, permissions and session revocation managed?
3. What data should be retained, for how long, and who can delete it?
4. Which privacy/export obligations apply to client notes and recipients?
5. What query plans and indexes support the expected list/usage traffic?
6. How should proposal pagination and an overall list deadline work?
7. Which stages should run in durable jobs rather than request lifetimes?
8. How are interrupted jobs detected, resumed and reconciled?
9. How do provider timeouts preserve external-write identity?
10. How should provider operations explicitly reference immutable snapshots?
11. How are costs, missing usage and per-tenant admission limits recorded?
12. Can authenticated webhooks reliably replace or complement status reads?
13. What multilingual evaluation supports identity and evidence policies?
14. How should hash, prompt and asset versions migrate without rewriting history?
15. What signals and alerts let an operator resolve an uncertain proposal safely?

These questions describe the open design work; they are not claims that the corresponding production features exist.
