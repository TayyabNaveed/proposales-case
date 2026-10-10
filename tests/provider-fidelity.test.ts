import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPricedPayload,
  verifyPricedProposal,
} from "../src/server/providers/proposales-mapping.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { reports } from "../src/domain/reports.js";
const snapshot = () =>
  buildDraftSnapshot(
    reports[0],
    {
      items: [
        {
          serviceId: "website-base",
          quantity: 1,
          disposition: "core",
          findingIds: ["nf1"],
          rationale: "Owner needs an online home.",
        },
        {
          serviceId: "service-page",
          quantity: 2,
          disposition: "core",
          findingIds: ["nf3"],
          rationale: "Dedicated additional service information.",
        },
        {
          serviceId: "website-maintenance",
          quantity: 1,
          disposition: "optional",
          findingIds: ["nf4"],
          rationale: "Owner requests ongoing support.",
        },
      ],
      questions: [],
      abstentionReason: null,
    },
    catalogueV2,
  );
const mappings = () =>
  snapshot().items.map((i, n) => ({
    serviceId: i.serviceId,
    productId: n + 10,
    variationId: n + 20,
    imageUuid: "00000000-0000-4000-8000-000000000001",
  }));
function proposal() {
  const body = buildPricedPayload(snapshot(), mappings(), "1", "op");
  return {
    ...body,
    uuid: "00000000-0000-4000-8000-000000000002",
    status: null,
    recipient_is_set: false,
    currency: "EUR",
    blocks: body.blocks.map((b) => ({ ...b, optional_picked: false })),
  };
}
test("priced blocks use variation IDs, cents, bounded quantities, optional and native monthly units", () => {
  const p = buildPricedPayload(snapshot(), mappings(), "1", "op");
  assert.equal(p.blocks[0].content_id, 20);
  assert.equal(p.blocks[0].unit_value_without_discount_without_tax, 15000);
  assert.equal(p.blocks[0].quantity, 2);
  assert.equal(p.blocks[2].recurring, true);
  assert.equal(p.blocks[2].unit, "month");
  assert.equal(p.blocks[2].optional, true);
  assert.equal(p.blocks[2].optional_picked, false);
  assert.equal("recipient" in p, false);
  assert.equal(p.tax_options.tax_included, false);
});
test("fidelity validates amounts, quantities, images, terms, optional and monthly semantics", () => {
  assert.equal(
    verifyPricedProposal(proposal(), snapshot(), mappings(), "1", "op")
      .verified,
    true,
  );
  for (const change of [
    { quantity: 1 },
    { unit_value_with_discount_without_tax: 1 },
    { content_id: 10 },
    { image_uuids: [] },
    { description: "Changed scope" },
  ]) {
    const p = proposal();
    Object.assign(p.blocks[0], change);
    assert.equal(
      verifyPricedProposal(p, snapshot(), mappings(), "1", "op").verified,
      false,
    );
  }
  for (const change of [
    { recurring: false },
    { unit: "year" },
    { optional: false },
    { optional_picked: true },
  ]) {
    const p = proposal();
    Object.assign(p.blocks[2], change);
    assert.equal(
      verifyPricedProposal(p, snapshot(), mappings(), "1", "op").verified,
      false,
    );
  }
});
test("cross-company, sent, recipient or metadata mismatches fail fidelity", () => {
  for (const change of [
    { company_id: 2 },
    { status: "sent" },
    { recipient_is_set: true },
    { data: { case_operation: "other" } },
    { tax_options: { mode: "none", tax_included: false } },
  ])
    assert.equal(
      verifyPricedProposal(
        { ...proposal(), ...change },
        snapshot(),
        mappings(),
        "1",
        "op",
      ).verified,
      false,
    );
});
test("missing, duplicate or unsafe library mappings fail before creation", () => {
  assert.throws(() => buildPricedPayload(snapshot(), [], "1", "op"));
  const m = mappings();
  m[1].variationId = m[0].variationId;
  assert.throws(() => buildPricedPayload(snapshot(), m, "1", "op"));
});
test("optional defaults patch preserves every block UUID and refuses changed commercial terms", async () => {
  const { buildOptionalDefaultsPatch } =
    await import("../src/server/providers/proposales-mapping.js");
  const p = proposal();
  p.blocks.forEach((b, n) =>
    Object.assign(b, { uuid: `00000000-0000-4000-8000-00000000000${n + 3}` }),
  );
  const body = buildOptionalDefaultsPatch(p, snapshot(), mappings(), "1", "op");
  assert.equal(body.blocks[2].optional_picked, false);
  assert.equal(body.blocks[0].uuid, "00000000-0000-4000-8000-000000000003");
  p.blocks[0].quantity = 10;
  assert.throws(() =>
    buildOptionalDefaultsPatch(p, snapshot(), mappings(), "1", "op"),
  );
});
