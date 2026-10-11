import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { reports } from "../src/domain/reports.js";
import {
  buildDraftSnapshot,
  type DraftSnapshot,
} from "../src/domain/offers.js";
import { recordedFor } from "../src/domain/workbench.js";
import {
  groupProposalItems,
  proposalCategories,
} from "../src/domain/proposal-groups.js";
const base = () =>
  buildDraftSnapshot(
    reports[0],
    recordedFor(reports[0].id).selection,
    catalogueV2,
  );
test("all fourteen services have exactly one category; unknown services fail closed", () => {
  assert.equal(proposalCategories.length, 5);
  const ids = proposalCategories.flatMap((c) => [...c.serviceIds]);
  assert.deepEqual(
    [...ids].sort(),
    catalogueV2.services.map((s) => s.id).sort(),
  );
  assert.equal(new Set(ids).size, 14);
  assert.throws(
    () =>
      groupProposalItems({
        ...base(),
        items: [{ ...base().items[0], serviceId: "unknown" }],
      }),
    /category/,
  );
});
test("grouping preserves exact money and order, splits billing and independently optional services", () => {
  const s = base();
  const before = JSON.stringify(s);
  const grouped = groupProposalItems(s);
  assert.deepEqual(
    grouped.map((g) => g.items.map((i) => i.serviceId)),
    [["website-base", "service-page", "faq-content"], ["website-maintenance"]],
  );
  assert.equal(JSON.stringify(s), before);
  assert.equal(
    grouped.reduce(
      (n, g) =>
        n +
        g.items
          .filter((i) => i.billing === "one-time")
          .reduce((a, i) => a + i.quantity * i.unitPriceMinor, 0),
      0,
    ),
    s.coreOneTimeMinor,
  );
  const mixed = {
    ...s,
    items: catalogueV2.services
      .filter((i) =>
        [
          "technical-seo",
          "seo-maintenance",
          "ai-visibility",
          "search-console",
        ].includes(i.id),
      )
      .map((i) => ({
        ...s.items[0],
        serviceId: i.id,
        billing: i.billing,
        disposition: (i.id === "ai-visibility" || i.id === "search-console"
          ? "optional"
          : "core") as "core" | "optional",
      })),
  };
  const groups = groupProposalItems(mixed);
  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.map((g) => [g.billing, g.disposition]),
    [
      ["one-time", "core"],
      ["monthly", "core"],
      ["one-time", "optional"],
      ["one-time", "optional"],
    ],
  );
  assert.deepEqual(
    groupProposalItems({ ...s, items: [...s.items].reverse() }),
    grouped,
  );
});
