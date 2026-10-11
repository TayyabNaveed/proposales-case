// Operator tool: preview first; --apply only after explicit account-change approval.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadLocalEnv, safeFailure } from "./env.js";
import {
  categoryManifest,
  seedCategory,
} from "../src/server/category-assets.js";
import { createAssetStore } from "../src/server/provider-assets.js";
import { createDatabase } from "../src/server/db.js";
import { createProposales } from "../src/server/providers/proposales.js";
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  const args = process.argv.slice(2),
    command = args[0] ?? "--dry-run";
  if (
    !["--dry-run", "--check-hosted", "--apply"].includes(command) ||
    args.length !== 3 ||
    args[1] !== "--origin"
  )
    throw Error("usage");
  const manifest = categoryManifest(args[2]);
  for (const asset of manifest) {
    const local = fs.readFileSync(
      `public/proposal-artwork/v1/${asset.categoryId}.png`,
    );
    if (createHash("sha256").update(local).digest("hex") !== asset.imageSha256)
      throw Error("local_asset_changed");
  }
  console.log(
    JSON.stringify(
      {
        mode: command,
        operation:
          "Create five category presentation containers; preserve existing service content",
        assets: manifest,
      },
      null,
      2,
    ),
  );
  if (command !== "--dry-run") {
    // Check all five exact public image bytes BEFORE any account write.
    for (const asset of manifest) {
      const r = await fetch(asset.imageUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (
        !r.ok ||
        !r.headers.get("content-type")?.startsWith("image/png") ||
        !r.body
      )
        throw Error("hosted_asset_unavailable");
      const chunks: Uint8Array[] = [];
      let length = 0;
      const reader = r.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 2_000_000) throw Error("asset_too_large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      if (
        createHash("sha256").update(Buffer.concat(chunks)).digest("hex") !==
        asset.imageSha256
      )
        throw Error("hosted_asset_mismatch");
    }
    console.log(JSON.stringify({ hostedImagesVerified: 5 }));
  }
  if (command === "--apply") {
    loadLocalEnv();
    const companyId = process.env.PROPOSALES_COMPANY_ID ?? "";
    const api = createProposales({
      companyId,
      apiKey: process.env.PROPOSALES_API_KEY ?? "",
    });
    const company = await api.verifyCompany();
    if (company.currency !== "EUR") throw Error("currency_mismatch");
    pool = createDatabase();
    const store = createAssetStore(pool);
    for (const asset of manifest) {
      const result = await seedCategory({
        companyId,
        categoryId: asset.categoryId,
        origin: args[2],
        store,
        api,
      });
      const ready = result.state === "confirmed" && !!result.imageUuid;
      console.log(
        JSON.stringify({
          category: asset.categoryId,
          state: result.state,
          verified: ready,
        }),
      );
      if (!ready) {
        process.exitCode = 1;
        break;
      }
    }
  }
} catch (e) {
  safeFailure(e);
} finally {
  await pool?.end();
}
