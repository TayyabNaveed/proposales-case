export function draftEvidence(
  proposal: {
    status: string | null;
    data?: Record<string, unknown> | null;
    recipient_is_set?: boolean;
  },
  matches: { uuid: string }[],
  uuid: string,
  key: string,
) {
  return {
    ok:
      proposal.status === "draft" &&
      proposal.data?.case_operation === key &&
      matches.some((p) => p.uuid === uuid),
    searchFindsDraft: matches.some((p) => p.uuid === uuid),
  };
}
