import { snapshotHash } from "./canonical.js";
import { trustedEditorUrl } from "./provider-url.js";
import type { OfferSnapshot } from "../domain/offers.js";
import type { ApprovedOffer } from "./offers.js";
import { executeDraft, type OperationStore } from "./operations.js";
export type DraftOutcome =
  | { state: "confirmed"; providerId: string; editorUrl: string }
  | { state: "claimed" | "unknown" | "verification_failed"; message: string };
export async function createReviewedDraft(options: {
  approvalId: string;
  expectedHash: string;
  reviewerId: string;
  companyId: string;
  approvals: { get(id: string, reviewer: string): Promise<ApprovedOffer> };
  operations: OperationStore;
  provider: {
    create(
      snapshot: OfferSnapshot,
      operationKey: string,
    ): Promise<{ uuid: string }>;
    verify(
      uuid: string,
      snapshot: OfferSnapshot,
      operationKey: string,
    ): Promise<{ editorUrl: string } | null>;
  };
}): Promise<DraftOutcome> {
  const approval = await options.approvals.get(
    options.approvalId,
    options.reviewerId,
  );
  if (
    approval.reviewerId !== options.reviewerId ||
    approval.snapshotHash !== options.expectedHash
  )
    throw new Error("stale_approval");
  const key = `offer:${options.companyId}:${approval.id}:${approval.snapshotHash}`;
  const operation = await executeDraft({
    key,
    hash: approval.snapshotHash,
    store: options.operations,
    create: () => options.provider.create(approval.snapshot, key),
  });
  if (operation.state !== "confirmed")
    return {
      state: operation.state,
      message:
        operation.state === "unknown"
          ? "The provider outcome is unknown. Reconcile the existing operation before any new creation."
          : "Creation is in progress. No second request will be dispatched.",
    };
  const uuid = operation.providerId;
  if (!uuid || !/^[a-f0-9-]{36}$/i.test(uuid))
    throw new Error("provider_reference_invalid");
  let verified: { editorUrl: string } | null = null;
  try {
    verified = await options.provider.verify(uuid, approval.snapshot, key);
  } catch {
    /* A read failure cannot justify another external write. */
  }
  if (!verified)
    return {
      state: "verification_failed",
      message:
        "A draft exists, but its terms could not be verified. Inspect the existing draft; do not recreate it.",
    };
  const url = new URL(verified.editorUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "secure.proposales.com" ||
    url.username ||
    url.password
  )
    throw new Error("provider_url_invalid");
  return {
    state: "confirmed",
    providerId: uuid,
    editorUrl: verified.editorUrl,
  };
}

export type SnapshotDraftOutcome = {
  state:
    "confirmed" | "claimed" | "unknown" | "verification_failed" | "not_started";
  snapshotId: string;
  message: string;
  providerId?: string;
  editorUrl?: string;
  issues?: string[];
};
export async function createDraftFromSnapshot(options: {
  snapshotId: string;
  accessScope: string;
  companyId: string;
  drafts: {
    get(
      id: string,
      scope: string,
    ): Promise<import("./drafts.js").StoredDraftSnapshot>;
  };
  operations: OperationStore;
  mode?: "create" | "status";
  provider: {
    prepare?(
      snapshot: import("../domain/offers.js").DraftSnapshot,
    ): Promise<void>;
    create(
      snapshot: import("../domain/offers.js").DraftSnapshot,
      key: string,
    ): Promise<{ uuid: string; url?: string }>;
    inspect(
      uuid: string,
      snapshot: import("../domain/offers.js").DraftSnapshot,
      key: string,
    ): Promise<{ verified: boolean; issues: string[]; url?: string }>;
    find(
      key: string,
    ): Promise<{ uuid: string; snapshotHash: string; url?: string }[]>;
  };
}): Promise<SnapshotDraftOutcome> {
  const stored = await options.drafts.get(
    options.snapshotId,
    options.accessScope,
  );
  if (stored.accessScope !== options.accessScope)
    throw new Error("draft_missing");
  if (snapshotHash(stored.snapshot) !== stored.snapshotHash)
    throw new Error("snapshot_tampered");
  if (!/^[1-9]\d*$/.test(options.companyId))
    throw new Error("provider_configuration_missing");
  const key = `draft:${options.companyId}:${stored.id}:${stored.snapshotHash}`;
  let operation;
  if (options.mode === "status") {
    try {
      operation = await options.operations.get(key);
    } catch (e) {
      if (e instanceof Error && e.message === "operation_missing")
        return {
          state: "not_started",
          snapshotId: stored.id,
          message: "This saved version has not been dispatched.",
        };
      throw e;
    }
    if (operation.state !== "confirmed") {
      try {
        const matches = (await options.provider.find(key)).filter(
          (p) => p.snapshotHash === stored.snapshotHash,
        );
        if (matches.length === 1) {
          const match = matches[0];
          if (!/^[a-f0-9-]{36}$/i.test(match.uuid))
            throw new Error("provider_reference_invalid");
          const url = trustedEditorUrl(match.url);
          await options.operations.record(key, {
            state: "confirmed",
            providerId: match.uuid,
            ...(url ? { editorUrl: url } : {}),
          });
          operation = await options.operations.get(key);
        }
      } catch {
        /* A failed/empty/ambiguous search never authorises another create. */
      }
    }
  } else {
    await options.provider.prepare?.(stored.snapshot);
    operation = await executeDraft({
      key,
      hash: stored.snapshotHash,
      store: options.operations,
      create: () => options.provider.create(stored.snapshot, key),
    });
  }
  if (operation.state !== "confirmed")
    return {
      state: operation.state,
      snapshotId: stored.id,
      message:
        operation.state === "unknown"
          ? "The creation outcome is unknown. Check this operation; do not generate another version to retry."
          : "Creation is in progress. Check status; no second creation is dispatched.",
    };
  const uuid = operation.providerId;
  if (!uuid || !/^[a-f0-9-]{36}$/i.test(uuid))
    throw new Error("provider_reference_invalid");
  let verified = false,
    issues = ["verification_read_failed"],
    url = trustedEditorUrl(operation.editorUrl);
  try {
    const inspection = await options.provider.inspect(
      uuid,
      stored.snapshot,
      key,
    );
    verified = inspection.verified;
    issues = inspection.issues;
    const observed = trustedEditorUrl(inspection.url);
    if (!url && observed) {
      await options.operations.record(key, {
        state: "confirmed",
        providerId: uuid,
        editorUrl: observed,
      });
      url = observed;
    }
  } catch {
    /* Preserve identity and its stored provider URL even when the read fails. */
  }
  return {
    state: verified && url ? "confirmed" : "verification_failed",
    snapshotId: stored.id,
    providerId: uuid,
    ...(url ? { editorUrl: url } : {}),
    issues: verified ? (url ? [] : ["editor_url_missing"]) : issues,
    message:
      verified && url
        ? "Draft verified. Open in Proposales to review and edit before manually sending."
        : "A draft exists, but verification or its editor link is incomplete. Inspect the existing proposal; do not recreate it.",
  };
}
