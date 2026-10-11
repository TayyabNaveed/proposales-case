import { test } from "node:test";
import assert from "node:assert/strict";
import { categorySnapshot, clientSnapshot } from "./category-fixtures.js";
import {
  buildPricedPayload,
  investmentSummary,
  verifyPricedProposal,
} from "../src/server/providers/proposales-mapping.js";
import { snapshotHash } from "../src/server/canonical.js";
const payload = () => buildPricedPayload(categorySnapshot(), [], "1", "test");
const actual = () => ({
  ...payload(),
  uuid: "00000000-0000-4000-8000-000000000099",
  status: "draft",
  recipient_is_set: false,
  currency: "EUR",
});
test("category payload uses pinned containers, exact service rows, notes and deterministic row identities", () => {
  const s = categorySnapshot();
  const p = payload();
  assert.equal(p.blocks.length, 2);
  const b = p.blocks[0] as any;
  assert.equal(b.content_id, 200);
  assert.equal(b.title, "Website & customer experience");
  assert.equal(b.multi_product_enabled, true);
  assert.deepEqual(
    b.multi_product_data.map((r: any) => [
      r.label,
      r.quantity,
      r.unitValueWithoutDiscountWithoutTax,
    ]),
    [
      ["Website foundation", 1, 120000],
      ["Additional service page", 2, 15000],
      ["FAQ content page", 1, 30000],
    ],
  );
  assert.match(b.multi_product_data[0].notes, /Excludes:/);
  assert.match(b.multi_product_data[0].notes, /Why:/);
  assert.equal(b.unit_value_without_discount_without_tax, 180000);
  assert.equal(p.blocks[1].recurring, true);
  assert.equal(p.blocks[1].unit, "month");
  assert.equal(p.blocks[1].unit_value_without_discount_without_tax, 8000);
  assert.deepEqual(payload(), p);
  assert.equal(new Set(b.multi_product_data.map((r: any) => r.uuid)).size, 3);
  assert.equal(
    verifyPricedProposal(actual(), s, [], "1", "test").verified,
    true,
  );
  // Changes to mutable legacy mappings cannot affect a pinned category payload.
  assert.deepEqual(
    buildPricedPayload(
      s,
      [
        {
          serviceId: "changed",
          productId: 1,
          variationId: 1,
          imageUuid: "00000000-0000-4000-8000-000000000001",
        },
      ],
      "1",
      "test",
    ),
    p,
  );
});
test("category verification rejects changed rows, prices, structure, image and monthly terms", () => {
  const mutations = [
    (p: any) => p.blocks[0].multi_product_data.reverse(),
    (p: any) => p.blocks[0].multi_product_data.pop(),
    (p: any) =>
      p.blocks[0].multi_product_data.push(p.blocks[0].multi_product_data[0]),
    (p: any) => (p.blocks[0].multi_product_data[0].quantity = 4),
    (p: any) =>
      (p.blocks[0].multi_product_data[0].unitValueWithoutDiscountWithoutTax = 1),
    (p: any) => (p.blocks[0].multi_product_data[0].notes = "Edited scope"),
    (p: any) => (p.blocks[0].multi_product_enabled = false),
    (p: any) => (p.blocks[0].unit_value_without_discount_without_tax = 1),
    (p: any) => (p.blocks[0].image_uuids = []),
    (p: any) => (p.blocks[1].recurring = false),
    (p: any) => p.blocks.reverse(),
  ];
  for (const mutate of mutations) {
    const p = actual();
    mutate(p);
    assert.equal(
      verifyPricedProposal(p, categorySnapshot(), [], "1", "test").verified,
      false,
    );
  }
});
test("independent optional items keep service identities and category artwork", () => {
  const s = categorySnapshot();
  s.items.find((i) => i.serviceId === "faq-content")!.disposition = "optional";
  s.coreOneTimeMinor -= 30000;
  s.optionalOneTimeMinor += 30000;
  const p = buildPricedPayload(s, [], "1", "test");
  const b = p.blocks.at(-1)! as any;
  assert.equal(b.optional, true);
  assert.equal(b.optional_picked, false);
  assert.equal(
    b.content_id,
    s.compositionAssets!.services.find((i) => i.serviceId === "faq-content")!
      .variationId,
  );
  assert.deepEqual(b.image_uuids, [
    s.compositionAssets!.categories[0].imageUuid,
  ]);
  assert.equal(b.multi_product_enabled, false);
  assert.equal(b.title, "FAQ content page");
  const a = {
    ...p,
    uuid: "00000000-0000-4000-8000-000000000099",
    status: "draft",
    recipient_is_set: false,
    currency: "EUR",
  };
  assert.equal(verifyPricedProposal(a, s, [], "1", "test").verified, true);
  b.optional_picked = true;
  assert.equal(verifyPricedProposal(a, s, [], "1", "test").verified, false);
});
test("missing, wrong-company, duplicate and incomplete composition assets fail before dispatch", () => {
  for (const mutate of [
    (s: any) => delete s.compositionAssets,
    (s: any) => (s.compositionAssets.companyId = "2"),
    (s: any) => s.compositionAssets.categories.pop(),
    (s: any) => s.compositionAssets.services.pop(),
    (s: any) =>
      (s.compositionAssets.categories[1] = s.compositionAssets.categories[0]),
    (s: any) => (s.items[0].unitPriceMinor = 1),
  ]) {
    const s = categorySnapshot();
    mutate(s);
    assert.throws(() => buildPricedPayload(s, [], "1", "test"));
  }
});
test("legacy payload bytes remain identical across all historical composition versions", () => {
  const s = categorySnapshot();
  delete s.compositionAssets;
  delete s.compositionVersion;
  delete s.presentation;
  const m = categorySnapshot().compositionAssets!.services;
  const cases = [
    [
      undefined,
      "1fd7f9782633bdae87148410d31991a524bc5b66d52c5226ce1ec4168e5f9b42",
    ],
    [
      "proposal-2",
      "62bbec21d2584e6d66a94c22a3e6e40585985b5829d1a88e257c7cc8a985d78b",
    ],
    [
      "proposal-3",
      "c8ae556d7178d8d660bf3706a5320e5f1a4b619d12b2b2820757cf780bc57cb3",
    ],
  ] as const;
  for (const [version, hash] of cases) {
    const v = {
      ...s,
      ...(version
        ? {
            compositionVersion: version,
            presentation: { intro: "A clear online home." },
          }
        : {}),
    };
    assert.equal(snapshotHash(buildPricedPayload(v, m, "1", "test")), hash);
  }
});
test("proposal-5 states one-time and monthly investment once, merges monthly services and drops billing filler", () => {
  const s = clientSnapshot();
  const p = buildPricedPayload(s, [], "1", "test");
  // Proposales sums one-time and monthly into one total, so the intro says both.
  assert.equal(
    p.description_md,
    "A clear online home.\n\nExample proposal for a fictional business. Investment: €1,800 one-time, then €560 per month. Optional extras are listed separately and not included.",
  );
  assert.deepEqual(
    p.blocks.map((b: any) => [b.title, b.recurring, b.optional, b.unit]),
    [
      ["Website & customer experience", false, false, "no-unit"],
      ["Ongoing monthly services", true, false, "month"],
      ["AI visibility foundations", false, true, "no-unit"],
    ],
  );
  const monthly = p.blocks[1] as any;
  const care = s.compositionAssets!.categories.find(
    (c) => c.categoryId === "ongoing-care",
  )!;
  assert.equal(monthly.content_id, care.variationId);
  assert.deepEqual(monthly.image_uuids, [care.imageUuid]);
  assert.deepEqual(
    monthly.multi_product_data.map((r: any) => [r.label, r.unit]),
    [
      ["Social media management", "month"],
      ["Website maintenance", "month"],
      ["SEO maintenance", "month"],
    ],
  );
  assert.equal(monthly.unit_value_without_discount_without_tax, 56000);
  // The client reads the scope; no exclusions, VAT, billing, Markdown or operator reasoning.
  const text = JSON.stringify(p.blocks) + p.description_md;
  for (const filler of [
    "Excludes",
    "**",
    "VAT",
    "Billing:",
    "Why:",
    "Included services",
    "Operator-facing",
  ])
    assert.equal(text.includes(filler), false, filler);
  assert.equal(
    (p.blocks[0] as any).multi_product_data[0].notes,
    s.items
      .find((i) => i.serviceId === "website-base")!
      .deliverables.join("\n"),
  );
  const a = {
    ...p,
    uuid: "00000000-0000-4000-8000-000000000099",
    status: "draft",
    recipient_is_set: false,
    currency: "EUR",
  };
  assert.equal(verifyPricedProposal(a, s, [], "1", "test").verified, true);
  // A proposal-4 snapshot of the same scope keeps its original layout.
  const older = buildPricedPayload(
    { ...s, compositionVersion: "proposal-4" },
    [],
    "1",
    "test",
  );
  assert.equal(older.blocks.length, 5);
  assert.match(older.description_md, /Prices exclude VAT\./);
});
test("proposal-5 investment line covers one-time only, monthly only and optional only", () => {
  const line = (once: number, monthly: number, optional = 0) =>
    investmentSummary({
      currency: "EUR",
      coreOneTimeMinor: once,
      coreMonthlyMinor: monthly,
      optionalOneTimeMinor: optional,
      optionalMonthlyMinor: 0,
    });
  assert.equal(line(150050, 0), "Investment: €1,500.50 one-time.");
  assert.equal(line(0, 8000), "Investment: €80 per month.");
  assert.equal(
    line(0, 0, 30000),
    "Optional extras are listed separately and not included.",
  );
});
test("proposal-5 verification checks category rows like proposal-4", () => {
  const s = clientSnapshot();
  const actual5 = () => ({
    ...buildPricedPayload(s, [], "1", "test"),
    uuid: "00000000-0000-4000-8000-000000000099",
    status: "draft",
    recipient_is_set: false,
    currency: "EUR",
  });
  assert.equal(
    verifyPricedProposal(actual5(), s, [], "1", "test").verified,
    true,
  );
  const mutations = [
    (p: any) => p.blocks[1].multi_product_data.reverse(),
    (p: any) => p.blocks[1].multi_product_data.pop(),
    (p: any) => (p.blocks[0].multi_product_data[0].quantity = 4),
    (p: any) =>
      (p.blocks[0].multi_product_data[0].unitValueWithoutDiscountWithoutTax = 1),
    (p: any) => (p.blocks[0].multi_product_data[0].notes = "Edited scope"),
    (p: any) => (p.blocks[1].multi_product_data[0].unit = "unit"),
    (p: any) => p.blocks.reverse(),
  ];
  for (const mutate of mutations) {
    const p = actual5();
    mutate(p);
    assert.equal(
      verifyPricedProposal(p, s, [], "1", "test").verified,
      false,
      mutate.toString(),
    );
  }
});
