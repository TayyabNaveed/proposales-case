import type pg from "pg";
import type { CatalogueV2 } from "../domain/catalogue.js";
import { snapshotHash } from "./canonical.js";
export type AssetRecord = {
  state: "claimed" | "unknown" | "confirmed";
  hash: string;
  productId: number | null;
  variationId: number | null;
  imageUuid: string | null;
};
export type ContentSummary = {
  productId: number;
  variationId: number;
  title: string;
  description: string;
  imageUuids: string[];
};
export interface AssetStore {
  claim(
    key: string,
    hash: string,
  ): Promise<"claimed" | "existing" | "conflict">;
  get(key: string): Promise<AssetRecord>;
  record(
    key: string,
    ids: { productId: number; variationId: number } | null,
  ): Promise<void>;
  verifyImage(key: string, imageUuid: string): Promise<void>;
}
export function validateImageUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error("invalid_image_url");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !/(^|\.)metascalers\.com$|(^|\.)cdninstagram\.com$|(^|\.)vercel\.app$/i.test(
      u.hostname,
    )
  )
    throw new Error("invalid_image_url");
  return u.toString();
}
export function serviceContent(catalogue: CatalogueV2, serviceId: string) {
  const service = catalogue.services.find((s) => s.id === serviceId);
  if (!service) throw new Error("unsupported_service");
  const fingerprint = snapshotHash({
    service,
    currency: catalogue.currency,
    version: catalogue.version,
  }).slice(0, 12);
  return {
    title: `Case demo · ${service.title} [${catalogue.version}/${serviceId}/${fingerprint}]`,
    description: `${service.deliverables.join("\n")}\n\nExcludes: ${service.exclusions.join("; ")}\n\nIllustrative EUR ${service.unitPriceMinor / 100} ${service.billing === "monthly" ? "per month" : "per unit, one-time"}, excluding tax. Final terms require human review.`,
  };
}
export async function seedService(options: {
  companyId: string;
  serviceId: string;
  catalogue: CatalogueV2;
  imageUrl: string;
  store: AssetStore;
  api: {
    createContent(input: {
      title: string;
      description: string;
      imageUrl: string;
    }): Promise<{ productId: number; variationId: number }>;
    getContent(id: number): Promise<ContentSummary>;
    listContent(): Promise<ContentSummary[]>;
  };
}): Promise<AssetRecord> {
  const { companyId, serviceId, catalogue, store, api } = options;
  if (!/^[1-9]\d*$/.test(companyId) || !Number.isSafeInteger(Number(companyId)))
    throw new Error("invalid_company");
  const imageUrl = validateImageUrl(options.imageUrl);
  const content = serviceContent(catalogue, serviceId),
    key = `company:${companyId}:catalogue:${catalogue.version}:service:${serviceId}`,
    hash = snapshotHash({ content, imageUrl });
  const admission = await store.claim(key, hash);
  if (admission === "conflict") throw new Error("asset_payload_conflict");
  if (admission === "claimed") {
    try {
      const created = await api.createContent({ ...content, imageUrl });
      await store.record(key, created);
    } catch {
      const saved = await store.get(key);
      if (saved.state !== "confirmed") await store.record(key, null);
    }
  }
  let row = await store.get(key);
  // Unknown/claimed writes are not reclaimed. Only a unique positive content match can reconcile.
  if (row.state !== "confirmed" && admission === "existing") {
    const matches = (await api.listContent()).filter(
      (c) => c.title === content.title && c.description === content.description,
    );
    if (matches.length === 1) {
      await store.record(key, {
        productId: matches[0].productId,
        variationId: matches[0].variationId,
      });
      row = await store.get(key);
    }
  }
  if (row.state === "confirmed" && row.variationId && row.productId) {
    try {
      const detail = await api.getContent(row.variationId);
      if (
        detail.productId !== row.productId ||
        detail.variationId !== row.variationId ||
        detail.title !== content.title ||
        detail.description !== content.description ||
        !detail.imageUuids.length
      )
        throw new Error("content_fidelity");
      await store.verifyImage(key, detail.imageUuids[0]);
    } catch {
      return { ...row, imageUuid: null };
    }
  }
  return store.get(key);
}
export function createAssetStore(
  pool: pg.Pool,
  schema = "case_workflow",
): AssetStore {
  if (!/^(case_workflow|case_test_[a-f0-9]+)$/.test(schema))
    throw new Error("invalid_schema");
  const table = `"${schema}".provider_assets`;
  return {
    async claim(key, hash) {
      const inserted = await pool.query(
        `INSERT INTO ${table}(asset_key,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING asset_key`,
        [key, hash],
      );
      if (inserted.rowCount === 1) return "claimed";
      const r = await pool.query(
        `SELECT payload_hash FROM ${table} WHERE asset_key=$1`,
        [key],
      );
      if (!r.rows[0]) throw new Error("asset_missing");
      return r.rows[0].payload_hash === hash ? "existing" : "conflict";
    },
    async get(key) {
      const r = await pool.query(
        `SELECT state,payload_hash AS hash,product_id AS "productId",variation_id AS "variationId",image_uuid AS "imageUuid" FROM ${table} WHERE asset_key=$1`,
        [key],
      );
      if (!r.rows[0]) throw new Error("asset_missing");
      const row = r.rows[0];
      return {
        ...row,
        productId: row.productId === null ? null : Number(row.productId),
        variationId: row.variationId === null ? null : Number(row.variationId),
      };
    },
    async record(key, ids) {
      const r = await pool.query(
        `UPDATE ${table} SET state=$2,product_id=$3,variation_id=$4,updated_at=now() WHERE asset_key=$1 AND (state IN ('claimed','unknown') OR (state='confirmed' AND product_id=$3 AND variation_id=$4))`,
        [
          key,
          ids ? "confirmed" : "unknown",
          ids?.productId ?? null,
          ids?.variationId ?? null,
        ],
      );
      if (r.rowCount !== 1) throw new Error("asset_transition_conflict");
    },
    async verifyImage(key, uuid) {
      const r = await pool.query(
        `UPDATE ${table} SET image_uuid=$2,updated_at=now() WHERE asset_key=$1 AND state='confirmed'`,
        [key, uuid],
      );
      if (r.rowCount !== 1) throw new Error("asset_transition_conflict");
    },
  };
}
export async function getServiceMapping(
  store: AssetStore,
  companyId: string,
  serviceId: string,
  catalogueVersion: string,
) {
  const row = await store.get(
    `company:${companyId}:catalogue:${catalogueVersion}:service:${serviceId}`,
  );
  if (
    row.state !== "confirmed" ||
    !row.productId ||
    !row.variationId ||
    !row.imageUuid
  )
    throw new Error("asset_not_verified");
  return {
    serviceId,
    productId: row.productId,
    variationId: row.variationId,
    imageUuid: row.imageUuid,
  };
}
