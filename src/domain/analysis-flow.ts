import type { ResearchInput } from "./research.js";
import { canRestartReport } from "./research.js";
import type { ReportV2 } from "./reports.js";
import type {
  PublicResearchRecord,
  SearchStage,
  ReportStage,
} from "./research-state.js";
export const isFreshStage = (
  s: { state: string; expiresAt: string | null } | null | undefined,
) =>
  !!s &&
  s.state === "ready" &&
  !!s.expiresAt &&
  Date.parse(s.expiresAt) > Date.now();
// Called only by an explicit Analyse/Continue action, never by rendering/restoration.
export async function analyseBusiness(d: {
  input: ResearchInput;
  search?: SearchStage | null;
  report?: ReportStage | null;
  request(path: string, body?: unknown): Promise<PublicResearchRecord>;
  isCurrent(): boolean;
  onSearch(s: SearchStage): void;
  onReport(r: ReportV2): void;
  onSavedReport?(r: ReportStage): void;
  onProgress(s: string): void;
  recommend(r: ReportV2): Promise<void>;
}) {
  let search = d.search,
    report = d.report;
  if (!isFreshStage(search)) {
    d.onProgress("Finding public information");
    const value = await d.request("/api/research", {
      input: d.input,
      refresh:
        !!search &&
        (search.state === "failed" ||
          search.state === "partial" ||
          canRestartReport(search)),
    });
    if (!d.isCurrent()) return;
    if (value.stage !== "search") throw Error("Sources could not be loaded.");
    search = value;
    d.onSearch(search);
  }
  if (!search || !isFreshStage(search))
    throw Error(
      search?.state === "partial"
        ? "Some sources could not be retrieved. Try again or explore an example."
        : "Research is still in progress. Check saved progress before continuing.",
    );
  if (!report || report.input.searchId !== search.id || !isFreshStage(report)) {
    d.onProgress("Understanding the business");
    const value = await d.request("/api/reports", {
      searchId: search.id,
      refresh:
        !!report &&
        report.input.searchId === search.id &&
        canRestartReport(report),
    });
    if (!d.isCurrent()) return;
    if (value.stage !== "report")
      throw Error("The business report could not be loaded.");
    report = value;
    d.onSavedReport?.(report);
  }
  if (!report || !isFreshStage(report) || !report.result)
    throw Error(
      report?.state === "running"
        ? "The report is still in progress. Check saved progress before continuing."
        : "The report could not be completed. Your sources are saved; try again.",
    );
  if (!d.isCurrent()) return;
  d.onReport(report.result.report);
  d.onProgress("Suggesting services");
  await d.recommend(report.result.report);
}
