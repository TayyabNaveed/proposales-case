# Code walkthrough — current refinement

1. Open `src/app/page.tsx` and `components/ExampleWorkbench.tsx`. The default tab is Research a business; Explore examples contains No website/Existing website. Navigation reads/preserves state and triggers no paid work.
2. `ResearchPanel.tsx` restores source/report IDs through GETs. `domain/analysis-flow.ts` runs only on Analyse/Continue and coordinates sources → report → recommendation. Examine the revision guard and saved-report/search linkage for stale response protection.
3. `ReportView.tsx` shows compact findings, uncertainties and expandable attributed excerpts. `ServicesView.tsx` shows core/optional scopes and prerequisites, with provenance under Technical details. `ProposalView.tsx` shows four independent billing totals and the single handoff.
4. `server/research-api.ts` / `api.ts` validate scope, Origin and input before consuming action budgets or invoking application services. `services.ts` wires adapters. Public research projections validate stage-specific JSON in `domain/research-state.ts`.
5. `server/research.ts` separately admits/caches search and report. `recommendations.ts` admits selection independently. Read `src/prompts/active.ts` and the named immutable sections in each prompt file; read `docs/PROMPTS.md` for provenance.
6. `domain/selection.ts` validates catalogue membership, quantities, findings, overlaps and prerequisite support. `domain/offers.ts` owns integer-minor-unit pricing. AI owns neither prices nor external writes.
7. `server/drafts.ts` first reuses an existing scope-owned request and checks the saved selections. Fresh generation validates recommendation/report/catalogue and creates an immutable snapshot pinned to proposal-2. `canonical.ts` handles identity; `presentation.ts` handles customer order.
8. `useProposalWorkflow.ts` persists browser request identity before creation and uses Web Locks plus native storage synchronization across windows. Global recovery takes precedence over latest research. The browser pointer supplements server admissions; it does not replace them.
9. `workflow.ts` and `operations.ts` preserve the provider-success/database-acknowledgement crash window. A missing/failed lookup is not proof that creation failed. Saved UUID/editor URLs survive failed fidelity reads. Existing provider edits are not automatically overwritten.
10. `providers/proposales-mapping.ts` preserves legacy composition and orders new snapshots consistently with the UI. New drafts use explicit live/example wording and each library item's image (the provider fills empty image lists). `verifyPricedProposal` checks prices, scope, identity, imagery and new block order.

## Local checks

Use Node24 (`nvm use`) and the matching npm. Run `npm test`, `npm run typecheck`, `npm run build`. `npm run test:db` uses isolated case_test schemas and injected synthetic model/search transports; it does not call paid providers. `npm run test:http` checks the running configured local app without model/provider dispatch.

`node --import tsx tests/browser-fixture-server.ts` starts an optional loopback3002 QA proxy over the built app on3001, with synthetic APIs. The QA-only access code is `local-ae-verification-1010`; there are no provider credentials or writes. `/test/seed?case=stalled-selection` and `pending-vs-research` exercise recovery. This fixture is test infrastructure and is never deployed as a route in the product.

`node --import tsx scripts/probe-refinement.ts --create` explicitly admits one synthetic example selection and one recipient-free real Proposales draft. Saves private identity before dispatch; repeats reuse the same request. Without --create it verifies an already saved run. Keep private outputs out of any repository/deployment. Review the actual unsent proposal manually in Proposales; the script never sends email.
