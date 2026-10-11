import type { ResearchInput, OperatorChoice } from "./research.js";
import { canRestartReport } from "./research.js";
import type { ReportV2 } from "./reports.js";
import type {
  PublicResearchRecord,
  SearchStage,
  IdentifyStage,
  ReportStage,
} from "./research-state.js";
export const isFreshStage = (
  s: { state: string; expiresAt: string | null } | null | undefined,
) =>
  !!s &&
  s.state === "ready" &&
  !!s.expiresAt &&
  Date.parse(s.expiresAt) > Date.now();
type Common = {
  request(path: string, body?: unknown): Promise<PublicResearchRecord>;
  isCurrent(): boolean;
  onProgress(s: string): void;
};
// Key-order-independent comparison for small saved inputs such as the choice.
const sameValue = (a: unknown, b: unknown) => {
  const sorted = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([x], [y]) => (x < y ? -1 : 1))
            .map(([k, x]) => [k, sorted(x)]),
        )
      : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
};
// A stage error carries the failure category, so the screen can say what to do.
export class StageError extends Error {
  constructor(
    message: string,
    readonly code?: string | null,
  ) {
    super(message);
  }
}
const retry = (s: { state: string; createdAt: string } | null | undefined) =>
  !!s && (s.state === "failed" || s.state === "partial" || canRestartReport(s));

// Step 1, on an explicit Analyse/Continue: sources, then candidate businesses.
// Stops for the operator's choice; never writes a report by itself.
export async function identifyStep(
  d: Common & {
    input: ResearchInput;
    search?: SearchStage | null;
    identify?: IdentifyStage | null;
    onSearch(s: SearchStage): void;
    onIdentify(i: IdentifyStage): void;
  },
) {
  let search = d.search,
    identify = d.identify;
  if (!isFreshStage(search)) {
    d.onProgress("Finding public information");
    const value = await d.request("/api/research", {
      input: d.input,
      refresh: retry(search),
    });
    if (!d.isCurrent()) return;
    if (value.stage !== "search") throw Error("Sources could not be loaded.");
    search = value;
    d.onSearch(search);
  }
  if (!search || !isFreshStage(search))
    throw new StageError(
      search?.state === "partial"
        ? "Some sources could not be retrieved. Try again or explore an example."
        : "Research is still in progress. Check saved progress before continuing.",
      search?.result?.failure,
    );
  if (!identify || identify.input.searchId !== search.id || !isFreshStage(identify)) {
    d.onProgress("Finding the business");
    const value = await d.request("/api/identify", {
      searchId: search.id,
      refresh: !!identify && identify.input.searchId === search.id && retry(identify),
    });
    if (!d.isCurrent()) return;
    if (value.stage !== "identify")
      throw Error("The business could not be identified.");
    identify = value;
  }
  if (!identify || !isFreshStage(identify) || !identify.result)
    throw new StageError(
      identify?.state === "running"
        ? "Still looking for the business. Check saved progress before continuing."
        : "The business could not be identified. Your sources are saved; try again.",
      identify?.diagnostics?.check,
    );
  if (!d.isCurrent()) return;
  d.onIdentify(identify);
  return identify;
}

// Step 2, after the operator chose: report on the chosen business, then services.
// A saved report is reused only when it was made for exactly this choice.
export async function continueWithChoice(
  d: Common & {
    search: SearchStage;
    identify: IdentifyStage;
    choice: OperatorChoice;
    report?: ReportStage | null;
    onSavedReport(r: ReportStage): void;
    onReport(r: ReportV2): void;
    recommend(r: ReportV2): Promise<void>;
  },
) {
  let report = d.report;
  const same =
    !!report &&
    report.input.identifyId === d.identify.id &&
    sameValue(report.input.choice ?? null, d.choice);
  if (!same || !isFreshStage(report)) {
    d.onProgress("Understanding the business");
    const value = await d.request("/api/reports", {
      searchId: d.search.id,
      identifyId: d.identify.id,
      choice: d.choice,
      refresh: same && retry(report),
    });
    if (!d.isCurrent()) return;
    if (value.stage !== "report")
      throw Error("The business report could not be loaded.");
    report = value;
    d.onSavedReport(report);
  }
  if (!report || !isFreshStage(report) || !report.result)
    throw new StageError(
      report?.state === "running"
        ? "The report is still in progress. Check saved progress before continuing."
        : "The report could not be completed. Your sources are saved; try again.",
      report?.diagnostics?.check,
    );
  if (!d.isCurrent()) return;
  d.onReport(report.result.report);
  d.onProgress("Suggesting services");
  await d.recommend(report.result.report);
}
