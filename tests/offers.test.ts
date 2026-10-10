import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOffer } from "../src/domain/offers.js";
const input = {
  exampleId: "no-website",
  catalogueVersion: "demo-2",
  selections: [
    { serviceId: "website-base", quantity: 1 },
    { serviceId: "website-maintenance", quantity: 1 },
  ],
};
test("catalogue controls mixed billing amounts", () => {
  const s = buildOffer(input);
  assert.equal(s.oneTimeMinor, 120000);
  assert.equal(s.monthlyMinor, 8000);
});
test("rejects invented commercial fields, unsupported services and invalid quantities", () => {
  for (const v of [
    { ...input, price: 1 },
    { ...input, selections: [{ serviceId: "fake", quantity: 1 }] },
    { ...input, selections: [{ serviceId: "website-base", quantity: 0 }] },
    { ...input, selections: [{ serviceId: "website-base", quantity: 1.2 }] },
    { ...input, catalogueVersion: "old" },
    { ...input, exampleId: "uncertain" },
  ])
    assert.throws(() => buildOffer(v));
});
test("duplicate services rejected and empty selection can dismiss", () => {
  assert.throws(() =>
    buildOffer({
      ...input,
      selections: [input.selections[0], input.selections[0]],
    }),
  );
  assert.equal(buildOffer({ ...input, selections: [] }).items.length, 0);
});
