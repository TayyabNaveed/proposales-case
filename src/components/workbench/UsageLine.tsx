"use client";
import { useEffect, useState } from "react";
type Period = { searches: number; credits: number; aiRuns: number; tokens: number };
const tokens = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));
const line = (p: Period) =>
  `${p.searches} ${p.searches === 1 ? "search" : "searches"} · ${p.credits} search credits · ${p.aiRuns} AI ${p.aiRuns === 1 ? "run" : "runs"} · ${tokens(p.tokens)} tokens`;
// Paid use from the stored runs, shown rather than blocked. Reloads after each
// analysis; cached results add nothing.
export function UsageLine({ refresh }: { refresh: number }) {
  const [usage, setUsage] = useState<{ today: Period; month: Period } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => !cancelled && setUsage(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  if (!usage) return null;
  return (
    <p className="usage-line">
      Usage today: {line(usage.today)}. This month: {line(usage.month)} (UTC).
    </p>
  );
}
