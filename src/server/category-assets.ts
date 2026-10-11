import {
  proposalCategories,
  compositionAssetsSchema,
  type CategoryId,
  type CompositionAssets,
} from "../domain/proposal-groups.js";
import type { DraftSnapshot } from "../domain/offers.js";
import {
  getServiceMapping,
  seedContentAsset,
  validateImageUrl,
  type AssetStore,
  type seedService,
} from "./provider-assets.js";
export const categoryAssetVersion = "categories-1" as const;
// A changed file needs a new asset version/namespace, not a mutation of old pins.
const hashes: Record<CategoryId, string> = {
  "website-experience":
    "bf80f7dadf9e10cb17258865ae0c4aae66b8afe3702a65ec094fb60ef1c178ed",
  "search-discoverability":
    "fd4ddd5d90e483e08d152579cd77874d472d9dae8552a46b5d3ab7178b45fb31",
  "paid-advertising":
    "6deb37f50271decb63aeed8a5c51fceed04bc567a33aa4766b9a59a08f347998",
  "social-media":
    "61008f7570f41809ab0da94600accea32840e1543ce625b8019238126592c6a5",
  "ongoing-care":
    "d6a6278c09fe21693b9fa7a5a53cfd61dd8173c617b824295da3d70957caf5d6",
};
// Category proposals with client-facing totals (proposal-5) are the default;
// PROPOSAL_COMPOSITION=proposal-4 or proposal-3 opts out for new proposals.
// Existing proposals always keep their own composition.
export function proposalComposition(value: string | undefined) {
  if (value === undefined || value === "" || value === "proposal-5") return "proposal-5";
  if (value === "proposal-4") return "proposal-4";
  if (value === "proposal-3") return "proposal-3";
  throw new Error("invalid_proposal_composition");
}
export function categoryManifest(origin: string) {
  const u = new URL(validateImageUrl(origin));
  if (u.pathname !== "/" || u.search || u.hash)
    throw Error("invalid_asset_origin");
  return proposalCategories.map((c) => ({
    categoryId: c.id,
    title: `Case category · ${c.title} [${categoryAssetVersion}/${c.id}/${hashes[c.id].slice(0, 12)}]`,
    description:
      "Presentation container. Scope, quantities and prices are supplied by the selected service definitions in each proposal.",
    imageUrl: `${u.origin}/proposal-artwork/v1/${c.id}.png`,
    imageSha256: hashes[c.id],
  }));
}
const categoryKey = (companyId: string, id: CategoryId) =>
  `company:${companyId}:categories:${categoryAssetVersion}:category:${id}`;
export async function seedCategory(options: {
  companyId: string;
  categoryId: CategoryId;
  origin: string;
  store: AssetStore;
  api: Parameters<typeof seedService>[0]["api"];
}) {
  const asset = categoryManifest(options.origin).find(
    (c) => c.categoryId === options.categoryId,
  );
  if (!asset) throw Error("unsupported_category");
  return seedContentAsset({
    ...options,
    key: categoryKey(options.companyId, asset.categoryId),
    content: { title: asset.title, description: asset.description },
    imageUrl: asset.imageUrl,
  });
}
// Adds the agency template's cover to proposal-5 assets. A cover is decoration:
// if it cannot be read, the proposal is still created with Proposales' default
// cover, and the reason is logged as a code only.
export async function withTemplateCover(
  assets: CompositionAssets,
  read: () => Promise<CompositionAssets["cover"] | null>,
): Promise<CompositionAssets> {
  try {
    const cover = await read();
    return cover ? compositionAssetsSchema.parse({ ...assets, cover }) : assets;
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    console.error(
      "template_cover_unavailable",
      typeof code === "string" ? code : "unexpected",
    );
    return assets;
  }
}
export async function loadCompositionAssets(
  store: AssetStore,
  companyId: string,
  snapshot: DraftSnapshot,
): Promise<CompositionAssets> {
  const categories = await Promise.all(
    proposalCategories.map(async (c) => {
      const r = await store.get(categoryKey(companyId, c.id));
      if (
        r.state !== "confirmed" ||
        !r.productId ||
        !r.variationId ||
        !r.imageUuid
      )
        throw Error("asset_not_verified");
      return {
        categoryId: c.id,
        productId: r.productId,
        variationId: r.variationId,
        imageUuid: r.imageUuid,
      };
    }),
  );
  const services = await Promise.all(
    snapshot.items.map((i) =>
      getServiceMapping(
        store,
        companyId,
        i.serviceId,
        snapshot.catalogueVersion,
      ),
    ),
  );
  return compositionAssetsSchema.parse({
    version: categoryAssetVersion,
    companyId,
    categories,
    services,
  });
}
