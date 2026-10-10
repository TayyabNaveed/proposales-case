# Phase 2: verified library and priced draft API

Prepared 10 October 2026. Backend/API acceptance is verified; visual acceptance is a manual follow-up.

Fourteen synthetic fixed-price agency modules were created and retrieved in the company-scoped Proposales library. Each mapping stores distinct product/variation IDs and a verified Uploadcare image UUID. The selected Metascalers Instagram artwork was imported into provider storage, so existing blocks no longer rely on its expiring CDN URL.

A single recipient-free draft contains the website base, two extra service pages, and optional website maintenance. The API round-trip confirms EUR 1,500 core one-time and EUR 80 optional per month, recurring month units, quantities, exact cents, scope, exclusions, images and tax-exclusive display. The initial API response omitted optional_picked; a guarded one-time defaults PATCH preserved all block UUIDs and explicitly set false. Subsequent GET passed every fidelity check. The draft remains unsent.

## Operator commands

```sh
npm run db:migrate
node --import tsx scripts/seed-services.ts website-base
node --import tsx scripts/seed-services.ts all
node --import tsx scripts/probe-priced-draft.ts
```

Set `PROPOSALES_IMAGE_URL` to an authorised public image URL, or provide the ignored private/image-import-url.txt. Existing seed identities cannot be reused with changed inputs. Do not delete claims or change operation keys to force retries. No-match reconciliation never permits another creation. Content lookup requires a positive unique match; detail verification confirms IDs, scope and stored image.

`probe-priced-draft.ts --set-optional-unselected` is an operator-only initial setup probe, admitted once and restricted to exact verified synthetic terms. It is not safe for ongoing synchronisation after human editing; do not use it as a product workflow. New create payloads explicitly request optional_picked=false and must still pass retrieval fidelity.

Known creation UUIDs persist independently of editor URL validity. Invalid URLs are withheld. Local evidence files are written after durable identity persistence; file failure cannot authorise re-creation.

## Remaining acceptance and next phase

Log into Proposales and inspect the existing test draft: image layout, monthly label and optional toggle must be clear in the editor and recipient preview. The agent could not complete this visual check because IAB was unauthenticated and Chrome use was not approved. No false visual-success claim is made. The actual API-returned editor URL is stored under private/ and linked only in the private career brief/user handoff.

AI selection belongs to Phase 3. The public workbench's draft endpoint remains gated until Phase 4 connects stored recommendation/snapshot inputs and the simplified single-review flow. Do not remove the guard merely because the operator smoke passed.

## Primary sources

- [Create content and URL-to-Uploadcare import](https://docs.proposales.com/api-reference/content/create)
- [Content lookup and detailed variation reads](https://docs.proposales.com/api-reference/content/list)
- [Create draft and variation references](https://docs.proposales.com/api-reference/proposals/create)
- [Block billing/optional semantics](https://docs.proposales.com/api-reference/entities/proposal-block)
- [Cents-based unit values](https://docs.proposales.com/api-reference/entities/unit-values)
- [PATCH identity and editor-owned content rules](https://docs.proposales.com/api-reference/proposals/patch-draft)

## Manual review feedback — 10 October

User confirmed both test drafts open and a background is visible. The shared Instagram artwork repeats in every service block and is deferred for visual polish; functional work takes priority. The zero-price discovery draft is an earlier transport probe, not the final product. A read-only API check reconfirmed 2×EUR150 additional pages + EUR1200 website = EUR1500 one-time; maintenance is optional EUR80/month and explicitly unselected. Full recipient-preview/toggle visual acceptance remains unconfirmed. Phase 3 recommendation implementation is next; no images or proposals were changed during this review.
