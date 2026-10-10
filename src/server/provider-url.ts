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
