# Category proposal composition

The category composition is implemented behind `PROPOSAL_COMPOSITION=proposal-4`. The default remains `proposal-3`. Local tests verify the contract; rollout still requires hosted images, imported category mappings and a live read-back/visual check. Background images and video are deferred.

## Service definitions and presentation containers

The fourteen catalogue services still own scope, exclusions, prerequisites, quantities and fixed prices. The model selects services, never categories or prices. The original service-level snapshot remains the audit record.

Five additional content-library entries provide category headings and artwork. A core block uses its category entry with a native `multi_product_data` breakdown: each row carries the service title, scope, rationale when applicable, exclusions, quantity and four exact price fields. The container is a presentation source, not a replacement catalogue service.

Core items group only within the same category and billing schedule. One-time and monthly blocks stay separate. Optional items remain separate service-linked blocks, initially unselected, with their category artwork. This preserves independent recipient choices even where it repeats an illustration. All four app totals retain their original meaning. No new model call is needed for composition.

| Category | Service IDs |
|---|---|
| Website & customer experience | website-base, booking-integration, enquiry-improvement, service-page, faq-content |
| Search & discoverability | google-profile, technical-seo, ai-visibility, search-console, seo-maintenance |
| Paid advertising | ads-setup, ads-management |
| Social media | social-management |
| Ongoing care | website-maintenance |

## Immutable provider references

Before saving a new proposal-4 snapshot, the server loads verified category and service mappings and pins them under `compositionAssets`. The company ID, mapping version, variation/product IDs and image UUIDs become part of the snapshot hash. Recovery and verification use those pins, not the mutable asset store. Missing or duplicate mappings fail before save/provider dispatch. Existing request IDs recover their original snapshot without requiring fresh recommendations or assets.

Historical undefined, proposal-2 and proposal-3 snapshots retain their payloads. Regression hashes pin their exact previous bytes. Category rows receive deterministic UUIDs from the snapshot and service identity. Verification checks block order, category/service identities, notes, row order, quantities, images, price fields, monthly terms and optional defaults. Unexpected discounts or pricing modes fail verification. A mismatch preserves the existing draft identity; it does not create or patch another draft.

## Operator rollout

Run with Node 24 or newer. The following commands have distinct effects; review the dry run and obtain approval before account writes or deployment.

1. Preview the five entries without credentials or network requests:

   ```sh
   node --import tsx scripts/seed-proposal-categories.ts --dry-run --origin https://proposales-case.vercel.app
   ```

2. Publish the reviewed category artwork through the approved deployment workflow. Check all five hosted PNGs match their pinned SHA-256 hashes:

   ```sh
   node --import tsx scripts/seed-proposal-categories.ts --check-hosted --origin https://proposales-case.vercel.app
   ```

3. After account-change approval, import the five category containers:

   ```sh
   node --import tsx scripts/seed-proposal-categories.ts --apply --origin https://proposales-case.vercel.app
   ```

   This checks every local/hosted image before the first account write. It uses the existing durable asset-admission mechanism in a separate `categories-1` namespace. Repeating the command reuses existing entries; uncertain writes are never blindly repeated. Original service content is not updated. No schema migration is required.

4. While the app still defaults to proposal-3, run the bounded synthetic grouped probe:

   ```sh
   node --import tsx scripts/probe-category-composition.ts --create
   node --import tsx scripts/probe-category-composition.ts --verify
   ```

   The first command admits at most one recipient-free unsent draft for its saved operation. It contains grouped one-time services, monthly care and a separately optional FAQ. Evidence is retained under ignored `private/`; verification makes no model call, content update, PATCH or sending request. If an operation is uncertain, reconcile the saved identity; do not delete evidence to force creation.

5. Verify the native proposal preview, including row descriptions, optional image override and monthly display. These details were not established by the earlier two-row feasibility probe. Only then set `PROPOSAL_COMPOSITION=proposal-4` in the intended environment and perform the normal protected app workflow check.

If activation causes problems, unset `PROPOSAL_COMPOSITION` for new requests. Existing proposal-4 snapshots retain their pins and recovery behavior. Do not delete provider entries, discard pending identities or rewrite existing drafts.

## Code map

- `src/domain/proposal-groups.ts`: categories, grouping and pinned asset schema.
- `src/server/category-assets.ts`: versioned manifest and verified mapping resolution.
- `src/server/providers/category-blocks.ts`: native rows, deterministic identity and fidelity checks.
- `src/server/drafts.ts`: pinning before persistence.
- `src/server/services.ts`: explicit rollout switch and historical recovery path.

The API documents [multi-product rows](https://docs.proposales.com/api-reference/entities/multi-product-row) and [block-level optionality/recurrence](https://docs.proposales.com/api-reference/entities/proposal-block). This integration does not assume separate category section types or row-level optional selection.
