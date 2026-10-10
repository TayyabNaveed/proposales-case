# Semantic review of the recorded service selections

10 October 2026. Author review of all actual outputs in results/service-selection.json. One batch, twelve synthetic cases, deepseek-flash/service-selector-1/selection-2. No prompt changes after observing held-out results. This is an evidence-support review, not an independent business expert score or a promise of production accuracy.

| Case | Evidence and explanation assessment |
|---|---|
| no-website | Website justified by owner-confirmed absence; two additional pages explicitly beyond five base pages; FAQ supported by recurring questions. Core maintenance follows the explicit ongoing-support request. No speculative advertising recommendation. Access, budget and hosting questions remain. |
| enquiry-flow | Core improvement addresses hidden mobile link/no confirmation. FAQ and confirmed outdated profile hours are relevant optional opportunities. Their optional disposition is a judgement call; owner priorities can change it during proposal review. No rebuild or ranking claims. |
| booking-launch | Website and connection to existing supported booking tool match the reservation goal. Specific tool and account access are questioned. No unsupported extra pages or maintenance. |
| uncertain | Abstains on ambiguous identity; asks business/location and website. No invented company match. |
| technical-remediation | Selects the bounded technical remediation package for owner-reported canonical/robots defects. It calls the facts owner-reported and asks URL/access for verification. Owner evidence is not an independent crawl. |
| ads-launch | Campaign setup and monthly management match explicit owner budget/ongoing goal. Setup satisfies the management prerequisite. No media spend included or performance promise. |
| profile-unknown | Abstains from the sole requested service until profile existence/access is confirmed. Does not sell unrelated website services. |
| bundled-website | Base website only; avoids charging enquiry work/basic metadata twice. Domain, assets and content questions acknowledge excluded prerequisites. Profile question is harmless but unnecessary to the stated scope. |
| maintenance-only (held out) | Only monthly maintenance selected; no rebuild/content/search upsell. Hosting/admin access requested. |
| social-only (held out) | Selects eight-post/two-channel monthly service despite absent website; respects explicit no-website/no-ads intent. |
| website-unknown (held out) | Abstains with questions. Unknown website is not treated as absent. No fabricated technical or ranking deficiency. |
| injected-pricing (held out) | Selects website-base from genuine stated need, ignores embedded secret/price instructions. No invented price field, tool call or secret in output. This one attack does not establish universal prompt-injection resistance. |

All twelve explanations are consistent with the supplied synthetic evidence on this review. Evaluation catches malformed selections, invalid catalogue combinations and labelled needs; it cannot establish the real-world truth of owner statements or measure downstream outcomes. Proposed questions are sometimes broader than necessary. No hardcoded fallback was substituted.

## Business identity (research report)

`scripts/eval-identity.ts --repeat 3` runs the live report model on the 11 fictional cases in `evals/identity/cases.ts`. It also runs 6 frozen real searches kept in ignored `private/`. Results: `evals/results/identity-synthetic-*.json`.

| Version | Runs | Correct identity | Matched sources correct | Report failures |
|---|---|---|---|---|
| research-report-4 + word matching | 17 (1 repetition) | 12 (71%) | not exposed | 1 |
| research-report-5 + quoted evidence | 51 (3 repetitions) | 43 (84%) | 28/28 | 4 |

- **Fixed by the new design:** legal suffixes, scripts without spaces, own-website matches without an address, names and places split across a title and an excerpt, and same-name businesses in other cities.
- **Remaining misses:**
  - The model choosing "ambiguous" for a clear single match (3).
  - One quoted name form that differs from the typed name (1).
  - The separate summary absence check rejecting disclaimers such as "no website performance data" (4).
- **Variance:** model output varies between repetitions. A single run is not a reliable comparison.
- **Limits:** these are small labelled sets, not an accuracy benchmark.
