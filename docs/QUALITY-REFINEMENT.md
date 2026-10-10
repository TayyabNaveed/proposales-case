# Product refinement — verification record

Verified locally on 10 October 2026, after the final provider-composition fix.

## What changed in the refinement

- Research a business is the default tab; Explore examples holds the No website and Existing website examples. Tab changes only read saved work.
- Analyse business progresses through the existing protected search → report → recommendation APIs. Failed stages keep earlier results and resume explicitly.
- Exact shipped prompts live in `src/prompts`, with template/config/schema fingerprints in run provenance and cache identity. See [PROMPTS](PROMPTS.md).
- Presentation order (core before optional, foundations before dependants, monthly after the work it supports) drives the UI and new `proposal-2` drafts. Canonical selection/hash order is unchanged; older snapshots keep their original composition.

## Final fix: provider images

The first bounded live `proposal-2` smoke created a correct unsent draft that failed verification with `images`. A read-only retrieval showed why: blocks sent with an empty image list came back with that library item's own stored image. Proposales does not honour an empty list, so a lead-only image cannot be expressed at creation. `proposal-2` now sends each item's library image explicitly, which matches what the provider stores, and fidelity stays exact. Provider state is the same either way, so no new composition version was needed. The existing draft verified on its next status read without being recreated or patched.

Repeated imagery across blocks therefore remains a content-library choice (one image per library item), not something the draft payload can remove.

## Evidence

| Check | Result |
|---|---|
| Offline suite (Node 24) | 122/122 |
| TypeScript, production build | Passed |
| Isolated database tests | 9/9 |
| Local HTTP guards | 1/1 |
| Live synthetic example → AI recommendation → unsent draft | Confirmed, no fidelity issues: 4 blocks, EUR 1,800 core one-time, EUR 80 core monthly, no recipient |
| Repeat request and status read | Same snapshot and provider draft reused; no second creation |
| Earlier Phase 4 draft status | Still recovers as confirmed |
| Recommendation usage | 1,991 input / 402 output tokens (1,792 cache-read subset) |

Browser checks for tabs, keyboard, 375px layout, stage failure/resume, reload and uncertain creation ran against the loopback QA fixture before the image fix. That fix changes only the provider payload, so they were not repeated.

## Still open

- Native visual acceptance of the draft in the Proposales editor is a manual check.
- Hosting, a least-privilege database role, trusted proxy identity for login limits, repository setup and the reviewer feedback loop are later work.
- No email was sent and no recipient was set.
