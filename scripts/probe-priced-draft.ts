import fs from "node:fs";
import { loadLocalEnv, safeFailure } from "./env.js";
import { catalogueV2 } from "../src/domain/catalogue.js";
import { reports } from "../src/domain/reports.js";
import { buildDraftSnapshot } from "../src/domain/offers.js";
import { snapshotHash } from "../src/server/offers.js";
import { createDatabase, createOperationStore } from "../src/server/db.js";
import {
  createAssetStore,
  getServiceMapping,
} from "../src/server/provider-assets.js";
import { createProposales } from "../src/server/providers/proposales.js";
import { executeDraft } from "../src/server/operations.js";
loadLocalEnv();
let pool: ReturnType<typeof createDatabase> | undefined;
try {
  const companyId = process.env.PROPOSALES_COMPANY_ID ?? "",
    api = createProposales({
      companyId,
      apiKey: process.env.PROPOSALES_API_KEY ?? "",
    });
  await api.verifyCompany();
  pool = createDatabase();
  const store = createOperationStore(pool),
    assets = createAssetStore(pool);
  const snapshot = buildDraftSnapshot(
    reports[0],
    {
      items: [
        {
          serviceId: "website-base",
          quantity: 1,
          disposition: "core",
          findingIds: ["nf1"],
          rationale:
            "An online home supports the owner’s stated service-information goal.",
        },
        {
          serviceId: "service-page",
          quantity: 2,
          disposition: "core",
          findingIds: ["nf3"],
          rationale:
            "The owner requests separate custom-build and fleet-service pages beyond the five-page base.",
        },
        {
          serviceId: "website-maintenance",
          quantity: 1,
          disposition: "optional",
          findingIds: ["nf4"],
          rationale: "The owner requests ongoing website support.",
        },
      ],
      questions: ["Confirm budget, hosting and account access before sending."],
      abstentionReason: null,
    },
    catalogueV2,
  );
  const mappings = await Promise.all(
    snapshot.items.map((i) =>
      getServiceMapping(assets, companyId, i.serviceId, catalogueV2.version),
    ),
  );
  const key = `company:${companyId}:priced-smoke:demo-2:v1`,
    hash = snapshotHash({ snapshot, mappings });
  let createdUrl: string | undefined, createdIdentity: string | undefined;
  const outcome = await executeDraft({
    key,
    hash,
    store,
    create: async () => {
      const created = await api.createPricedDraft(snapshot, mappings, key);
      createdUrl = created.url;
      createdIdentity = created.uuid;
      return created;
    },
    afterConfirmed: async () => {
      fs.mkdirSync("private", { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        "private/priced-draft-editor.json",
        JSON.stringify({
          uuid: createdIdentity!,
          url: createdUrl,
          operationKey: key,
        }) + "\n",
        { mode: 0o600 },
      );
    },
  });
  if (outcome.state !== "confirmed" || !outcome.providerId) {
    console.log(
      JSON.stringify({
        ok: false,
        state: outcome.state,
        reconciliationRequired: true,
      }),
    );
    process.exitCode = 1;
  } else {
    if (process.argv.includes("--set-optional-unselected")) {
      const patchKey = key + ":optional-defaults-v1";
      await executeDraft({
        key: patchKey,
        hash,
        store,
        create: () =>
          api.patchOptionalDefaults(
            outcome.providerId!,
            snapshot,
            mappings,
            key,
          ),
      });
    }
    const proposal = await api.getDraft(outcome.providerId);
    const fidelity = await api.verifyPricedDraft(
      outcome.providerId,
      snapshot,
      mappings,
      key,
    );
    fs.writeFileSync(
      "private/priced-draft-evidence.json",
      JSON.stringify(
        {
          uuid: outcome.providerId,
          operationKey: key,
          snapshot,
          mappings,
          proposal,
          fidelity,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        state: outcome.state,
        verified: fidelity.verified,
        issues: fidelity.issues,
        blocks: proposal.blocks?.length,
        recipientSet: proposal.recipient_is_set,
        coreOneTimeMinor: snapshot.coreOneTimeMinor,
        optionalMonthlyMinor: snapshot.optionalMonthlyMinor,
        editorUrlSaved:
          !!createdUrl || fs.existsSync("private/priced-draft-editor.json"),
      }),
    );
    if (!fidelity.verified) process.exitCode = 1;
  }
} catch (error) {
  safeFailure(error);
} finally {
  await pool?.end();
}
