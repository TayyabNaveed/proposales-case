"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import type { ProposalRow, ProposalStatus } from "../../server/proposals";

export const statusLabel: Record<ProposalStatus, string> = {
  draft: "Draft · not sent",
  active: "Sent",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
  replaced: "Replaced by a newer version",
  not_created: "Not created in Proposales",
  unavailable: "Status unavailable",
};
// Short labels for the sidebar, in the order a proposal moves through them.
export const statusOrder: Array<[ProposalStatus, string]> = [
  ["draft", "Draft"],
  ["active", "Sent"],
  ["accepted", "Accepted"],
  ["rejected", "Declined"],
  ["expired", "Expired"],
  ["withdrawn", "Withdrawn"],
  ["replaced", "Replaced"],
  ["not_created", "Not created"],
  ["unavailable", "Status unavailable"],
];

// The proposals this app created, with live status read from Proposales. Shared
// by the sidebar (counts by status) and the Proposals view. Reloaded on sign-in,
// when a new proposal appears, and on request.
export function useProposals(
  authenticated: boolean,
  onExpired: () => void,
  reloadKey: string,
) {
  const [rows, setRows] = useState<ProposalRow[] | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(
        (
          await apiRequest<{ proposals: ProposalRow[] }>(
            "/api/proposals",
            undefined,
            onExpired,
          )
        ).proposals,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (authenticated) void load();
  }, [authenticated, reloadKey]);
  const counts = new Map<ProposalStatus, number>();
  for (const r of rows ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return { rows, loading, error, load, counts };
}
export type Proposals = ReturnType<typeof useProposals>;
