import "server-only";
import { createDatabase } from "./db.js";
import { createApprovalStore } from "./offers.js";
let db: ReturnType<typeof createDatabase> | undefined;
export function database() {
  return (db ??= createDatabase());
}
export function approvals() {
  return createApprovalStore(database());
}
