// One recipient-free synthetic draft. No AI call, sending, content update or PATCH.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadLocalEnv, safeFailure } from "./env.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { reports } from "../src/domain/reports.js";
import { recordedFor } from "../src/domain/workbench.js";
import {
  buildDraftSnapshot,
  type DraftSnapshot,
} from "../src/domain/offers.js";
import { loadCompositionAssets } from "../src/server/category-assets.js";
import { createAssetStore } from "../src/server/provider-assets.js";
import { createDatabase, createOperationStore } from "../src/server/db.js";
import { createProposales } from "../src/server/providers/proposales.js";
import {
  buildPricedPayload,
  verifyPricedProposal,
} from "../src/server/providers/proposales-mapping.js";
import { executeDraft } from "../src/server/operations.js";
import { snapshotHash } from "../src/server/canonical.js";
const file = "private/category-composition-smoke.json";
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  const command = process.argv[2] ?? "--verify";
  if (!["--create", "--verify"].includes(command)) throw Error("usage");
  loadLocalEnv();
  const companyId = process.env.PROPOSALES_COMPANY_ID ?? "";
  const api = createProposales({
    companyId,
    apiKey: process.env.PROPOSALES_API_KEY ?? "",
  });
  type Evidence = {
    companyId: string;
    key: string;
    snapshot: DraftSnapshot;
    providerId?: string;
    url?: string;
    verified?: boolean;
    issues?: string[];
  };
  let saved: Evidence | undefined = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : undefined;
  const persist = () => {
    fs.mkdirSync("private", { recursive: true });
    fs.writeFileSync(file, JSON.stringify(saved, null, 2) + "\n", {
      mode: 0o600,
    });
  };
  if (!saved) {
    if (command !== "--create") throw Error("creation_flag_required");
    await api.verifyCompany();
    pool = createDatabase();
    const selection = structuredClone(recordedFor(reports[0].id).selection);
    selection.items.find((i) => i.serviceId === "faq-content")!.disposition =
      "optional";
    const base = buildDraftSnapshot(reports[0], selection, catalogueV2);
    const assets = await loadCompositionAssets(
      createAssetStore(pool),
      companyId,
      base,
    );
    saved = {
      companyId,
      key: "category-composition:" + randomUUID(),
      snapshot: {
        ...base,
        compositionVersion: "proposal-4",
        compositionAssets: assets,
        presentation: {
          intro:
            "Synthetic composition verification. Website foundation and additional pages, monthly care and an optional FAQ. Do not send.",
        },
      },
    };
    persist();
  }
  if (saved.companyId !== companyId) throw Error("company_mismatch");
  const payload = buildPricedPayload(saved.snapshot, [], companyId, saved.key);
  if (!saved.providerId) {
    if (command !== "--create") throw Error("creation_flag_required");
    pool ??= createDatabase();
    const outcome = await executeDraft({
      key: saved.key,
      hash: snapshotHash(payload),
      store: createOperationStore(pool),
      create: () => api.createPricedDraft(saved!.snapshot, [], saved!.key),
    });
    if (outcome.state !== "confirmed" || !outcome.providerId) {
      console.log(
        JSON.stringify({ state: outcome.state, reconciliationRequired: true }),
      );
      process.exitCode = 1;
    } else {
      saved.providerId = outcome.providerId;
      saved.url = outcome.editorUrl ?? undefined;
      persist();
    }
  }
  if (saved.providerId) {
    const p = await api.getDraft(saved.providerId);
    const result = verifyPricedProposal(
      p,
      saved.snapshot,
      [],
      companyId,
      saved.key,
    );
    Object.assign(saved, result);
    persist();
    console.log(
      JSON.stringify({
        ...result,
        status: p.status,
        recipientSet: p.recipient_is_set,
        blocks: p.blocks?.length,
        url: saved.url,
        coreOneTimeMinor: saved.snapshot.coreOneTimeMinor,
        coreMonthlyMinor: saved.snapshot.coreMonthlyMinor,
        optionalOneTimeMinor: saved.snapshot.optionalOneTimeMinor,
      }),
    );
    if (!result.verified) process.exitCode = 1;
  }
} catch (e) {
  safeFailure(e);
} finally {
  await pool?.end();
}
