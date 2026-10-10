# Prompt foundation

Active families are `research-report-4` (`src/prompts/research-report/v4.ts`) and `service-selector-1` (`service-recommendation/v1.ts`). `active.ts` pins them. Versions 3 and 4 change only the identity rule:

- One excerpt matching the name with the supplied location, address or website confirms identity.
- A conflicting or unverified listing becomes an uncertainty.
- Same-name businesses in other locations are ignored as unrelated results.
- Ambiguity is reserved for indistinguishable matches in the supplied location.

`research-report-2` and `-3` are retained unchanged for replay and rollback.

Validation `research-validation-4` removes an individual unsupported finding or action and discloses the removal, instead of rejecting every supported statement. An unsupported summary still rejects the report. Failures record which check failed as a short code, never raw model text. Named sections reconstruct the exact previously shipped instruction text; extraction hash regressions verify that no policy text changed. Earlier research versions whose text was not retained are unavailable for replay.

The research prompt owns sourced summary/uncertainty rules. Selection owns conservative catalogue relevance. Operational configuration owns bounded tokens/deadlines/attempts and selector input clipping. Deterministic code owns prices, quantities, dependencies, access and external-write identity. User/source data stays in the untrusted data message. The existing schema still permits longer reasons than the prompt requests; extraction deliberately preserves that historical contract.

New admissions retain template, configuration and output-schema fingerprints; schema, input-builder and validation version; report/evidence/catalogue/scope identity; effective request hash; requested model, returned model metadata when available; date, latency, actual usage/attempts and validation outcome. Selector repair text has a fingerprint and uses one bounded correction. Safe report failures retain diagnostics; provider errors/raw bodies and secrets are not logged. Historical runs remain historical and may have incomplete provenance.

Changing an active prompt/config/schema fingerprint invalidates the corresponding cache for new work, while immutable old runs/snapshots remain recoverable. Separate search/report/selection caches avoid unnecessary reruns. Request fingerprints characterize the adapter's request inputs; provider/SDK/model-alias changes prevent promising byte-identical future output.

Behaviour improvements come later through frozen sources/reports, baseline/candidate versions, usage/latency and human assessment. This refinement adds provenance, not a feedback platform or automatic model training. Do not rewrite a version in place when tuning policy; add a new file/version, compare, explicitly promote and retain the preceding active version for rollback.
