import { createHash } from "node:crypto";
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJSON(v))
      .join(",") +
    "}"
  );
}
export function snapshotHash(snapshot: unknown) {
  return createHash("sha256").update(canonicalJSON(snapshot)).digest("hex");
}
