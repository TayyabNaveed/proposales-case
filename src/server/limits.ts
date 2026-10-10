// Optional daily admission caps per access scope (UTC day). Access is
// authenticated, so there is no cap by default: rate limits (access-store.ts),
// caching and the provider accounts' own limits bound use, and usage is shown
// rather than blocked. A deployment can still set DAILY_LIMIT_<ACTION>.
export type LimitedAction = "search" | "identify" | "report" | "recommendation" | "draft";

export function dailyLimit(
  action: LimitedAction,
  env: Record<string, string | undefined> = process.env,
): number | null {
  const raw = env["DAILY_LIMIT_" + action.toUpperCase()];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  // An invalid value fails closed rather than silently removing the cap.
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1 || n > 100000)
    throw new Error("limit_configuration_invalid");
  return n;
}
