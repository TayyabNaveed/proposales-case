# Guided proposal flow

Status: approved direction, 11 October 2026. Phases 1–3 implemented: the guided flow; other services, usage, notes, introduction and recipient; and the Proposals page. Category composition (proposal-4) is implemented behind an activation switch; artwork hosting, category import and live acceptance are pending, and cover/background polish is deferred. Each phase is reviewed before it is committed. How this spec was produced is described in [WORKFLOW](../WORKFLOW.md).

## Problem

Live testing on 10 October showed the pipeline making decisions it cannot make reliably on its own.

- **Which business.** Results mix same-name businesses, older listings and directories. Identity was a bare model verdict re-checked by word matching. It failed on legal suffixes, inflection, detailed addresses and scripts without spaces (evaluation baseline: 12/17 correct).
- **Whether a website exists.** A website counted only if the user typed it. A business's own site found in the results stayed "unknown", and 11 of 14 services require a website. Live research of Handy Heroes AB confirmed the business but suggested nothing.
- **Unknown is not absent.** With the website unknown, the selector can neither recommend building one nor improving one, so it abstains.

The AI is being asked to settle facts that one question to the operator settles immediately.

## Goal

Help an agency operator draft a well-scoped, good-looking proposal in a few minutes. The AI does the reading, matching and first draft. Code verifies everything checkable. The operator makes the decisions: once for identity, once for scope, and finally in Proposales before sending.

Non-goals: sending from this app (the Proposales API has no send or status-change operation), autonomous agents, owner-specific analytics we cannot access.

## Flow

| Step | Operator sees | AI | Code | Operator decides |
|---|---|---|---|---|
| 1. Start | Name and location fields | — | Validates input | Starts analysis |
| 2. Search | Progress | — | 3 bounded Tavily searches, ≤8 excerpts | — |
| 3. Identify | Progress | Proposes ≤3 candidate businesses, each with quoted name/address and possible website sources | Verifies quotes and resemblance in any language (`domain/identity.ts`); removes unverified candidates | — |
| 4. Choose | Dialog: candidates; website suggestions for the chosen one, a field to type one, or Continue | — | Records the choice | **Business (required). Website: pick, type, or continue without one** |
| 5. Report | Summary, findings, open questions, sources | Writes findings from the chosen business's sources only | Drops unsupported statements; quotes must exist | — |
| 6. Services | Suggested core and optional modules with reasons | Suggests catalogue modules and quantities | Catalogue, quantity, prerequisite and overlap checks; prices from the fixed catalogue | **Keeps, removes or reduces items** |
| 7. Recipient | Dialog pre-filled with company and contact suggestions | — | Suggests names/emails only if quoted in the chosen business's sources | Edits or skips (non-blocking) |
| 8. Create | Progress, then the draft link | Writes a short introduction citing verified findings | Builds the draft: ordered category blocks, category images and recipient; verifies it by reading it back | — |
| 9. Review | Open in Proposales | — | — | **Reviews, edits and sends in Proposales** |
| 10. Track | Proposals page with live status | — | Reads status from Proposales | — |

### Decisions

- **Identity is chosen, not inferred.** With one verified candidate the dialog preselects it. The operator still confirms it, because one confirmation is cheaper than one wrong proposal.
- **The website is the operator's fact.** A picked or typed website marks the website present, attributed "confirmed by operator". **Continue** records "no website selected": website-foundation services become eligible and are labelled as based on that choice. The selector never has to guess between building and improving.
- **Suggestions are suggestions.** Every AI output arrives with its evidence and can be removed. The AI owns no price, no external write and no final decision.
- **Contacts are never invented.** A suggested email must appear in the chosen business's sources, and generic role addresses on the business's own domain are preferred. Otherwise the field is empty.

### Decisions added during phase 1 review

- **Other services.** Below the AI suggestions, a collapsed and unchecked list offers the rest of the catalogue. The operator can add any of them. Code still enforces prerequisites and overlaps. Added items are labelled "Added by you" and carry no AI reason. The operator may also change AI quantities within catalogue bounds.
- **Neutral feedback log.** Record which services were added from the list and which suggestions were removed, without interpreting either. An addition can mean a missed need or a service offered to everyone.
- **Client notes.** An optional field in the choose dialog ("Notes from the client"). The notes are an attributed operator source: they inform the report, the suggestions and the introduction. They are never required.
- **Proposal text.**
  - The title has no demo wording.
  - Review questions are shown in the app, not in the proposal.
  - A short AI introduction states who we are, what we noticed and what we propose. It is written as a follow-up when notes exist and as a first approach otherwise. Each sentence must cite a verified finding, a client note or a chosen service.
- **Usage line.** While logged in, show today's and this month's searches, Tavily credits, AI calls and tokens, read from the stored runs.

## Contracts (new or changed)

- `IdentityCandidates`: up to 3 candidates. Each has `sourceIds`, a `name` quote, a `location` quote (or null) and `websiteSourceIds` (sources the model believes are the business's own site). Code keeps a website suggestion only if its source belongs to the candidate and its domain resembles the business name.
- `OperatorChoice`: `{ searchId, candidateIndex, website: { kind: "selected" | "typed" | "none", url? } }`. It is immutable and saved, and it is part of the report's cache identity.
- `ReportV2.capabilities.website`: `present` with evidence for selected/typed; `absent` with `confirmedBy: "operator"` for none. The report schema gains attribution for operator-supplied facts.
- `Recipient`: `{ companyName, contactName?, email? }`. Each suggestion carries its source ID.
- `ProposalIntro`: short markdown. Every sentence references a finding ID; code removes sentences without a valid reference.
- Prompts are new versions; earlier versions stay for replay.

## Proposal design

- **Category presentation containers.** Five additional library entries carry the approved category artwork. The fourteen service definitions remain the source of scope and prices. Core services group by category and billing schedule; optional services remain independently selectable. See [category composition](../PROPOSAL-CATEGORIES.md) for the immutable snapshot contract and rollout.
- **Order:** foundations first, then supporting work, then monthly services, with optional items last (`domain/presentation.ts`).
- **Text:** an AI introduction from verified findings; for each service, what is included, why (with a cited finding) and billing.
- **Cover/background:** cover artwork is accepted provisionally. Image/video integration and further visual polish are deferred until the planned functional steps are complete.
- **Research summary attachment (later phase):** an HTML page with the chosen business's findings, sources and visibility check.

## Visibility check (stretch phase)

Measured, never estimated: a few category web searches and AI-assistant prompts per business, and channel presence (own site, directories, social, reviews). It is reported as "appeared in X of N checks on <date>" with the method stated. No rankings or scores are claimed. Charts go in the research summary attachment. Each check costs credits and calls, so it is bounded and runs only on request.

## Landing page

Short instructions instead of marketing copy: what the tool does, the steps above, what the AI does and does not decide, and where the proposal is reviewed and sent.

## Logging and learning

Every AI call is already stored with its prompt version, fingerprints, model, timing, tokens and validation outcome. In addition, record the operator's choices as feedback:

- whether the chosen business was the AI's first candidate;
- whether the website was picked, typed or skipped;
- which suggested services were removed or reduced.

`scripts/export-ai-runs.ts` writes these to JSON Lines for evaluation. Proposals' later status (accepted, rejected) is joined by proposal ID. Prompt changes are compared on the evaluation sets in `evals/` before promotion.

## Phases and acceptance

| Phase | Scope | Acceptance |
|---|---|---|
| 1 | Identify → choose dialog → report → services | Evaluation sets pass at or above the identity baseline. The choice is recorded and drives website eligibility. Handy Heroes AB gets suggestions. Tests, build and DB checks pass. |
| 2 | Other services and neutral add/remove log; usage line; client notes, recipient dialog, AI introduction, title, questions in app; then category composition and artwork | A real draft shows category images, the introduction and the recipient, and passes the read-back check. Visual check in Proposales. |
| 3 | Proposals page with live status | Lists this app's proposals; status matches Proposales. |
| 4 | Landing instructions and UI polish | Desktop and 375px layouts, keyboard and screen-reader labels checked. |
| 5 | AI run and choice export | The export file covers every stage; evaluation reports are reproducible. |
| 6 | Visibility check and research attachment (stretch) | Method stated on every chart; bounded cost; no unmeasured numbers. |

## Risks and open questions

- The background image needs an asset `id` and `uuid`; how to obtain one through the API is unverified.
- Whether markdown in proposal text renders images is undocumented, so charts go in the attachment.
- The status webhook's activation and verification are undocumented, so status is read on demand.
- An attachment is a public URL. It must be unguessable and contain only public-source information.
