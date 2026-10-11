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
export function categorySnapshot(): DraftSnapshot {
  const s = base();
  return {
    ...s,
    compositionVersion: "proposal-4",
    presentation: { intro: "A clear online home." },
    compositionAssets: {
      version: "categories-1",
      companyId: "1",
      categories: proposalCategories.map((c, n) => ({
        categoryId: c.id,
        productId: 100 + n,
        variationId: 200 + n,
        imageUuid: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
      })),
      services: s.items.map((i, n) => ({
        serviceId: i.serviceId,
        productId: 10 + n,
        variationId: 20 + n,
        imageUuid: "00000000-0000-4000-8000-000000000009",
      })),
    },
  };
}
// proposal-5 with monthly services from three categories and one optional extra.
export function clientSnapshot(): DraftSnapshot {
  const selection = recordedFor(reports[0].id).selection;
  const extra = (serviceId: string, disposition: "core" | "optional") => ({
    serviceId,
    quantity: 1,
    disposition,
    findingIds: selection.items[0].findingIds,
    rationale: "Operator-facing reason.",
  });
  const s = buildDraftSnapshot(
    reports[0],
    {
      ...selection,
      items: [
        ...selection.items,
        extra("seo-maintenance", "core"),
        extra("social-management", "core"),
        extra("ai-visibility", "optional"),
      ],
    } as Parameters<typeof buildDraftSnapshot>[1],
    catalogueV2,
  );
  const pinned = categorySnapshot().compositionAssets!;
  return {
    ...s,
    compositionVersion: "proposal-5",
    presentation: { intro: "A clear online home." },
    compositionAssets: {
      ...pinned,
      services: s.items.map((i, n) => ({
        serviceId: i.serviceId,
        productId: 10 + n,
        variationId: 20 + n,
        imageUuid: "00000000-0000-4000-8000-000000000009",
      })),
    },
  };
}
