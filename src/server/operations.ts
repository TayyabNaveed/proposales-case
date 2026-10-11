import { trustedEditorUrl } from "./provider-url.js";
export type Operation = {
  state: "claimed" | "unknown" | "confirmed" | "rejected";
  providerId: string | null;
  editorUrl?: string | null;
  // A safe error category such as http_422 or network; never a provider body.
  errorCode?: string | null;
};
export type Outcome =
  | { state: "unknown"; errorCode?: string }
  | { state: "rejected"; errorCode: string }
  | { state: "confirmed"; providerId: string; editorUrl?: string };
// A provider client error means the request was refused and nothing was created.
// Timeouts, conflicts, rate limits, server errors and dropped connections leave
// the outcome unknown: the draft may exist, so it is never created again blindly.
export function classifyWriteFailure(error: unknown): Outcome {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "network";
  const definite =
    /^http_4\d\d$/.test(code) &&
    !["http_408", "http_409", "http_429"].includes(code) &&
    !(error as { outcomeUnknown?: boolean }).outcomeUnknown;
  const safe = /^[a-z0-9_]{1,40}$/.test(code) ? code : "provider_error";
  return definite ? { state: "rejected", errorCode: safe } : { state: "unknown", errorCode: safe };
}
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
  } catch (error) {
    // Includes the crash window after provider success but before local persistence.
    // Never automatically reclaim or redispatch an admitted operation.
    const persisted = await store.get(key);
    if (persisted.state === "confirmed") return persisted;
    await store.record(key, classifyWriteFailure(error));
  }
  return store.get(key);
}
