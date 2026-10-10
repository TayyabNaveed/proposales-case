import fs from "node:fs";
import { loadLocalEnv, safeFailure } from "./env.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { createDatabase } from "../src/server/db.js";
import { createProposales } from "../src/server/providers/proposales.js";
import {
  createAssetStore,
  seedService,
} from "../src/server/provider-assets.js";
loadLocalEnv();
const command = process.argv[2];
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  const companyId = process.env.PROPOSALES_COMPANY_ID ?? "",
    api = createProposales({
      companyId,
      apiKey: process.env.PROPOSALES_API_KEY ?? "",
    });
  const company = await api.verifyCompany();
  if (company.currency !== "EUR") throw new Error("currency_mismatch");
  const imageUrl =
    process.env.PROPOSALES_IMAGE_URL ??
    fs.readFileSync("private/image-import-url.txt", "utf8").trim();
  pool = createDatabase();
  const store = createAssetStore(pool);
  const services =
    command === "all"
      ? catalogueV2.services
      : catalogueV2.services.filter((s) => s.id === command);
  if (!services.length)
    throw new Error("Usage: seed-services website-base|service-id|all");
  for (const service of services) {
    const row = await seedService({
      companyId,
      serviceId: service.id,
      catalogue: catalogueV2,
      imageUrl,
      store,
      api,
    });
    const ready = row.state === "confirmed" && !!row.imageUuid;
    console.log(
      JSON.stringify({
        serviceId: service.id,
        state: row.state,
        contentAndImageVerified: ready,
      }),
    );
    if (!ready) {
      process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  safeFailure(error);
} finally {
  await pool?.end();
}
