import { validateSelection } from "../src/domain/selection.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import type { Fixture } from "./fixtures/index.js";
export function evaluateSelection(fixture: Fixture, raw: unknown) {
  try {
    const selection = validateSelection(fixture.report, raw, catalogueV2),
      ids = selection.items.map((i) => i.serviceId);
    const unexpected = ids.filter((id) => !fixture.allowed.includes(id));
    const missing = fixture.requiredAny.filter(
      (group) => !group.some((id) => ids.includes(id)),
    );
    const quantities = selection.items.filter(
      (i) =>
        fixture.quantities?.[i.serviceId] !== undefined &&
        i.quantity !== fixture.quantities[i.serviceId],
    );
    const abstention = (selection.items.length === 0) === fixture.abstain;
    return {
      invariants: true,
      labelledFit:
        !unexpected.length &&
        !missing.length &&
        !quantities.length &&
        abstention,
      unexpected,
      missing,
      wrongQuantities: quantities.map((i) => i.serviceId),
      abstentionMatches: abstention,
      humanReview: "pending" as const,
    };
  } catch {
    return {
      invariants: false,
      labelledFit: false,
      unexpected: [],
      missing: [],
      wrongQuantities: [],
      abstentionMatches: false,
      humanReview: "pending" as const,
    };
  }
}
