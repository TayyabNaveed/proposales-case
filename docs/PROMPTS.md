# Prompt foundation

Active families are `business-identity-1` (`src/prompts/business-identity/v1.ts`), `research-report-7` (`research-report/v7.ts`), `service-selector-1` (`service-recommendation/v1.ts`) and `proposal-intro-1` (`proposal-intro/v1.ts`). `active.ts` pins them.

- `research-report-7` adds how to treat the operator's client notes (an attributed source, never public information).
- `proposal-intro-1` drafts a three-to-four-sentence introduction. Each sentence lists its references (finding IDs, `notes`, `service:<id>`, `agency`). `domain/intro.ts` keeps only sentences whose references exist, at most five. It is written as a follow-up when the client's goals are known, and as a first approach otherwise. The operator edits it before creating the proposal.

- `business-identity-1` is the identify stage. It returns up to three candidates with quoted name and location evidence and the sources it believes are each business's own website. `domain/identity.ts` verifies them (`identity-validation-1`).
- `research-report-6` writes the report for the operator-chosen business from that business's sources only. It no longer decides identity; its wording is otherwise unchanged from v5.
- Thresholds are named in `identityThresholds`: name containment 0.8, location containment 0.8, website resemblance 0.5. They are measured with `scripts/eval-identity.ts --repeat 3`, not tuned per case.
- Earlier versions, including `research-report-5`, which decided identity inside the report, are retained for replay and rollback.

Validation `research-validation-4` removes an individual unsupported finding or action and discloses the removal, instead of rejecting every supported statement. An unsupported summary still rejects the report. Failures record which check failed as a short code, never raw model text. Named sections reconstruct the exact previously shipped instruction text; extraction hash regressions verify that no policy text changed. Earlier research versions whose text was not retained are unavailable for replay.

The research prompt owns sourced summary/uncertainty rules. Selection owns conservative catalogue relevance. Operational configuration owns bounded tokens/deadlines/attempts and selector input clipping. Deterministic code owns prices, quantities, dependencies, access and external-write identity. User/source data stays in the untrusted data message. The existing schema still permits longer reasons than the prompt requests; extraction deliberately preserves that historical contract.

New admissions retain template, configuration and output-schema fingerprints; schema, input-builder and validation version; report/evidence/catalogue/scope identity; effective request hash; requested model, returned model metadata when available; date, latency, actual usage/attempts and validation outcome. Selector repair text has a fingerprint and uses one bounded correction. Safe report failures retain diagnostics; provider errors/raw bodies and secrets are not logged. Historical runs remain historical and may have incomplete provenance.

Changing an active prompt/config/schema fingerprint invalidates the corresponding cache for new work, while immutable old runs/snapshots remain recoverable. Separate search/report/selection caches avoid unnecessary reruns. Request fingerprints characterize the adapter's request inputs; provider/SDK/model-alias changes prevent promising byte-identical future output.

Behaviour improvements come later through frozen sources/reports, baseline/candidate versions, usage/latency and human assessment. This refinement adds provenance, not a feedback platform or automatic model training. Do not rewrite a version in place when tuning policy; add a new file/version, compare, explicitly promote and retain the preceding active version for rollback.
