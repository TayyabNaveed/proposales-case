import type { PromptDefinition } from "../prompts/active.js";
import { snapshotHash } from "./canonical.js";
import { createHash } from "node:crypto";
export function promptProvenance(
  definition: PromptDefinition,
  schema?: unknown,
) {
  return {
    promptId: definition.id,
    promptVersion: definition.version,
    templateHash: createHash("sha256").update(definition.system).digest("hex"),
    configHash: snapshotHash(definition.config),
    inputBuilderVersion: definition.inputBuilderVersion,
    validationVersion: definition.validationVersion,
    schemaVersion: definition.schemaVersion,
    ...(schema ? { schemaHash: snapshotHash(schema) } : {}),
    provenanceVersion: "prompt-provenance-1",
  };
}
