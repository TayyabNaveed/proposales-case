import { trustedEditorUrl } from "./provider-url.js";
export type Operation = {
  state: "claimed" | "unknown" | "confirmed";
  providerId: string | null;
  editorUrl?: string | null;
};
export type Outcome =
  | { state: "unknown" }
  | { state: "confirmed"; providerId: string; editorUrl?: string };
export interface OperationStore {
  claim(
    key: string,
    hash: string,
  ): Promise<"claimed" | "existing" | "conflict">;
  get(key: string): Promise<Operation>;
  record(key: string, outcome: Outcome): Promise<void>;
}
export async function executeDraft(options: {
  key: string;
  hash: string;
  store: OperationStore;
  create: () => Promise<{ uuid: string; url?: string }>;
  afterConfirmed?: () => Promise<void>;
}): Promise<Operation> {
  const { key, hash, store, create } = options;
  const claim = await store.claim(key, hash);
  if (claim === "conflict") throw new Error("payload_conflict");
  if (claim === "existing") return store.get(key);
  try {
    const result = await create();
    await store.record(key, {
      state: "confirmed",
      providerId: result.uuid,
      ...(trustedEditorUrl(result.url)
        ? { editorUrl: trustedEditorUrl(result.url) }
        : {}),
    });
    await options.afterConfirmed?.();
  } catch {
    // Includes the crash window after provider success but before local persistence.
    // Never automatically reclaim or redispatch an admitted operation.
    const persisted = await store.get(key);
    if (persisted.state === "confirmed") return persisted;
    await store.record(key, { state: "unknown" });
  }
  return store.get(key);
}
