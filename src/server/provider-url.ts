export function trustedEditorUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      u.hostname === "secure.proposales.com" &&
      !u.port &&
      !u.username &&
      !u.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

// Proposales adds a PDF link to an accepted proposal (observed 11 October; drafts
// have none). It serves the accepted document without signing in, so only
// Proposales' own PDF paths are passed on.
export function trustedPdfUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      ["esign.proposales.com", "secure.proposales.com"].includes(u.hostname) &&
      /^\/(api\/)?pdf\//.test(u.pathname) &&
      !u.port &&
      !u.username &&
      !u.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
