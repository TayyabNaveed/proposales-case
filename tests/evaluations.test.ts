import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtures } from "../evals/fixtures/index.js";
import { evaluateSelection } from "../evals/service-selection.js";
const item = (serviceId: string, quantity = 1) => ({
  serviceId,
  quantity,
  disposition: "core",
  findingIds: ["nf1"],
  rationale: "Observed owner need.",
});
test("evaluation distinguishes invariant validity from labelled relevance and quantities", () => {
  const fixture = fixtures[0];
  assert.equal(
    evaluateSelection(fixture, {
      items: [item("website-base")],
      questions: [],
      abstentionReason: null,
    }).invariants,
    true,
  );
  assert.equal(
    evaluateSelection(fixture, {
      items: [item("website-base")],
      questions: [],
      abstentionReason: null,
    }).labelledFit,
    false,
  );
  const valid = {
    items: [
      item("website-base"),
      { ...item("service-page", 2), findingIds: ["nf3"] },
    ],
    questions: [],
    abstentionReason: null,
  };
  assert.equal(evaluateSelection(fixture, valid).labelledFit, true);
  assert.equal(
    evaluateSelection(fixture, {
      ...valid,
      items: [valid.items[0], { ...valid.items[1], quantity: 3 }],
    }).labelledFit,
    false,
  );
  assert.equal(
    evaluateSelection(fixture, { ...valid, items: [item("invented")] })
      .invariants,
    false,
  );
});
test("evaluation checks abstention and does not call correct JSON proof of relevance", () => {
  const fixture = fixtures.find((f) => f.id === "uncertain")!;
  const abstain = {
    items: [],
    questions: ["Which business?"],
    abstentionReason: "Identity unclear.",
  };
  assert.equal(evaluateSelection(fixture, abstain).labelledFit, true);
  assert.equal(
    evaluateSelection(fixture, { ...abstain, items: [item("website-base")] })
      .invariants,
    false,
  );
  assert.equal(fixtures.filter((f) => f.split === "development").length, 8);
  assert.equal(fixtures.filter((f) => f.split === "held-out").length, 4);
});
