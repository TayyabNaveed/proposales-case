"use client";
import { useEffect, useRef, useState } from "react";
import { reports, reportSchema, type ReportV2 } from "../domain/reports";
import {
  findSavedGeneration,
  canAdoptReport,
  isSettledOutcome,
  isProposalStorageKey,
  UnreadableGeneration,
  discardUnreadableGeneration,
} from "../domain/workbench";
import { apiRequest } from "./workbench/api";
import { ResearchPanel } from "./ResearchPanel";
import { UsageLine } from "./workbench/UsageLine";
import { ProposalsList } from "./workbench/ProposalsList";
import { useProposals, statusOrder } from "./workbench/useProposals";
import type { ProposalStatus } from "../server/proposals";
import { useDemoSession } from "./workbench/useDemoSession";
import {
  useProposalWorkflow,
  type ProposalWorkflow,
} from "./workbench/useProposalWorkflow";
import { ReportView } from "./workbench/ReportView";
import { ServicesView } from "./workbench/ServicesView";
import { ProposalView } from "./workbench/ProposalView";
type View = "research" | "examples" | "proposals";
const steps: Array<[string, string]> = [
  [
    "Research",
    "Enter a business name and place. Public sources are collected and you confirm which business it is.",
  ],
  [
    "Suggest",
    "Services from the catalogue are suggested, each tied to evidence. You keep, remove or add services.",
  ],
  [
    "Create",
    "An unsent draft is created in Proposales with an introduction and the recipient you choose.",
  ],
  [
    "Review and send",
    "You review and send from Proposales. Its status appears here.",
  ],
];
function Journey({
  flow,
  authenticated,
  blocked,
}: {
  flow: ProposalWorkflow;
  authenticated: boolean;
  blocked: boolean;
}) {
  if (!flow.report) return null;
  return (
    <>
      <div className="workspace">
        <ReportView
          report={flow.report}
          showQuestions={!flow.recommendation.selection?.questions.length}
        />
        <ServicesView
          flow={flow}
          authenticated={authenticated}
          blocked={blocked}
        />
      </div>
      <ProposalView
        flow={flow}
        authenticated={authenticated}
        blocked={blocked}
      />
    </>
  );
}
export function ExampleWorkbench({
  initialAuthenticated,
}: {
  initialAuthenticated: boolean;
}) {
  const session = useDemoSession(initialAuthenticated),
    live = useProposalWorkflow(null, session),
    examples = useProposalWorkflow(reports[0], session);
  const [view, setView] = useState<View>("research"),
    [filter, setFilter] = useState<ProposalStatus | null>(null),
    // The landing page shows until access is unlocked or the visitor chooses
    // the examples; afterwards the workspace stays mounted so work is kept.
    [entered, setEntered] = useState(initialAuthenticated),
    [detailsSlot, setDetailsSlot] = useState<HTMLElement | null>(null),
    [code, setCode] = useState(""),
    [researchBusy, setResearchBusy] = useState(false),
    // Bumped when research or suggestions finish, so the usage line reloads.
    [usageRefresh, setUsageRefresh] = useState(0);
  const [saved, setSaved] =
      useState<ReturnType<typeof findSavedGeneration>>(null),
    [recoveryMessage, setRecoveryMessage] = useState(""),
    [recoveryBlocked, setRecoveryBlocked] = useState(true),
    [unreadable, setUnreadable] = useState<UnreadableGeneration | null>(null);
  useEffect(() => {
    const scan = () => {
      try {
        setSaved(findSavedGeneration(localStorage));
        setUnreadable(null);
        setRecoveryBlocked(false);
      } catch (error) {
        setSaved(null);
        setRecoveryBlocked(true);
        setUnreadable(error instanceof UnreadableGeneration ? error : null);
        setRecoveryMessage(
          error instanceof UnreadableGeneration
            ? error.message
            : "Saved proposal recovery could not be read. Enable browser storage before creating another proposal.",
        );
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (isProposalStorageKey(event.key)) scan();
    };
    scan();
    window.addEventListener("case-generation-changed", scan);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener("case-generation-changed", scan);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  useEffect(() => {
    if (!saved || !session.authenticated) return;
    let cancelled = false;
    setRecoveryBlocked(true);
    // A saved request whose proposal already exists has done its job: release it
    // quietly. An unfinished, uncertain or expired one is restored, so the
    // operator sees its outcome next to the scope they approved.
    apiRequest<{ outcome: { state: string; providerId?: string } }>(
      "/api/drafts?requestId=" +
        encodeURIComponent(saved.request.requestId) +
        "&recommendationId=" +
        encodeURIComponent(saved.request.recommendationId),
      undefined,
      session.expire,
    )
      .then((status) => {
        if (cancelled) return null;
        if (
          isSettledOutcome(status.outcome) &&
          status.outcome.state !== "expired"
        ) {
          localStorage.removeItem("case-generation:" + saved.reportId);
          window.dispatchEvent(new Event("case-generation-changed"));
          setRecoveryBlocked(false);
          return null;
        }
        setView(saved.reportId.startsWith("live-") ? "research" : "examples");
        return apiRequest<{ recommendation: { report: ReportV2 } }>(
          "/api/recommendations?id=" +
            encodeURIComponent(saved.request.recommendationId),
          undefined,
          session.expire,
        );
      })
      .then((v) => {
        if (cancelled || !v) return;
        const r = reportSchema.parse(v.recommendation.report);
        if (r.id !== saved.reportId)
          throw Error("Saved proposal belongs to another business.");
        (r.mode === "live" ? live : examples).adopt(r);
        setRecoveryMessage(
          "Your saved proposal request is restored. Check its progress before starting another.",
        );
        setRecoveryBlocked(false);
      })
      .catch(() => {
        if (!cancelled)
          setRecoveryMessage(
            "Saved proposal recovery could not be loaded. Sign in again and reload to recover it.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [saved?.reportId, saved?.request.requestId, session.authenticated]);
  useEffect(() => {
    if (session.authenticated) setEntered(true);
    // Access ended while researching: unlock again on the landing page. The
    // workspace stays mounted, so the work in progress is kept.
    else if (view !== "examples") setEntered(false);
  }, [session.authenticated]);
  const crossBlocked =
    live.locked || examples.locked || !!saved || recoveryBlocked;
  const proposals = useProposals(
    session.authenticated,
    session.expire,
    (live.outcome?.providerId ?? "") + ":" + (examples.outcome?.providerId ?? ""),
  );
  // Move focus to the new view's heading, so keyboard and screen-reader users
  // land where the content changed.
  const headings = useRef<Partial<Record<View, HTMLHeadingElement | null>>>({});
  function open(next: View, status: ProposalStatus | null = null) {
    setView(next);
    setFilter(status);
    if (next === "proposals") void proposals.load();
    requestAnimationFrame(() => headings.current[next]?.focus());
  }
  const showLanding = !entered;
  return (
    <>
      {showLanding && (
        <main className="landing">
          <a href="/" className="brand">
            <span className="mark">f.</span> fieldwork
          </a>
          <section className="landing-intro" aria-labelledby="landing-title">
            <h1 id="landing-title">
              From a business name to a proposal you can send.
            </h1>
            <p className="lede">
              Fieldwork researches a business from public sources, suggests the
              services that fit, and creates a draft proposal in Proposales for
              you to review and send.
            </p>
          </section>
          <ol className="steps">
            {steps.map(([name, text], i) => (
              <li key={name}>
                <span className="step-number">{i + 1}</span>
                <strong>{name}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <section className="access-card" aria-labelledby="access-title">
            <h2 id="access-title">Unlock access</h2>
            {session.authenticated ? (
              <button className="primary" onClick={() => setEntered(true)}>
                Continue
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void session.login(code).then(() => setCode(""));
                }}
              >
                <label htmlFor="demo-code">Demo access code</label>
                <input
                  id="demo-code"
                  type="password"
                  required
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="primary" disabled={session.busy}>
                  {session.busy ? "Opening access…" : "Unlock access"}
                </button>
              </form>
            )}
            {session.message && <p role="status">{session.message}</p>}
            <p className="access-note">
              Access enables research and proposal creation. Nothing is sent
              from this app.
            </p>
          </section>
          <p className="landing-alt">
            No code?{" "}
            <button
              className="text-action"
              onClick={() => {
                setEntered(true);
                open("examples");
              }}
            >
              Explore the two fictional examples
            </button>
          </p>
        </main>
      )}
      <div className="shell" hidden={showLanding}>
        <aside className="sidebar">
          <a href="/" className="brand">
            <span className="mark">f.</span> fieldwork
          </a>
          <nav aria-label="Workspace">
            <ul>
              {session.authenticated && (
                <li>
                  <button
                    aria-current={view === "research" ? "page" : undefined}
                    onClick={() => open("research")}
                  >
                    New research
                  </button>
                </li>
              )}
              <li>
                <button
                  aria-current={view === "examples" ? "page" : undefined}
                  onClick={() => open("examples")}
                >
                  Examples
                </button>
              </li>
              {session.authenticated && (
                <li>
                  <button
                    aria-current={
                      view === "proposals" && !filter ? "page" : undefined
                    }
                    onClick={() => open("proposals")}
                  >
                    Proposals
                    {proposals.rows && (
                      <span className="count">{proposals.rows.length}</span>
                    )}
                  </button>
                  {proposals.counts.size > 0 && (
                    <ul className="status-nav" aria-label="Proposals by status">
                      {statusOrder
                        .filter(([s]) => proposals.counts.has(s))
                        .map(([s, label]) => (
                          <li key={s}>
                            <button
                              aria-current={
                                view === "proposals" && filter === s
                                  ? "page"
                                  : undefined
                              }
                              onClick={() => open("proposals", s)}
                            >
                              <span className={"dot status-" + s} />
                              {label}
                              <span className="count">
                                {proposals.counts.get(s)}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              )}
            </ul>
          </nav>
          <div className="sidebar-foot">
            {session.authenticated ? (
              <>
                <p className="access-state">
                  <span className="access-dot" /> Access active
                </p>
                <UsageLine refresh={usageRefresh} />
              </>
            ) : (
              <>
                <p className="access-state">
                  {session.message || "Examples only. Unlock access to research a business and create proposals."}
                </p>
                <button className="primary" onClick={() => setEntered(false)}>
                  Unlock access
                </button>
              </>
            )}
          </div>
        </aside>
        <main className="content">
          {recoveryMessage && (
            <p role="status" className="recovery-note">
              {recoveryMessage}
              {unreadable && (
                <button
                  onClick={async () => {
                    try {
                      await discardUnreadableGeneration(
                        localStorage,
                        navigator.locks,
                        unreadable,
                      );
                      setRecoveryMessage("");
                      window.dispatchEvent(
                        new Event("case-generation-changed"),
                      );
                    } catch (error) {
                      setRecoveryMessage((error as Error).message);
                    }
                  }}
                >
                  Discard unreadable recovery copy
                </button>
              )}
            </p>
          )}
          <section
            aria-labelledby="view-research"
            hidden={view !== "research"}
          >
            <header className="view-header">
              <h1
                id="view-research"
                tabIndex={-1}
                ref={(el) => {
                  headings.current.research = el;
                }}
              >
                New research
              </h1>
              <p>
                Enter a business name and place. We collect public sources,
                confirm the business with you, and suggest services that fit.
                <small>
                  Closing this page may pause analysis. Saved work continues
                  when you return.
                </small>
              </p>
            </header>
            <ResearchPanel
              authenticated={session.authenticated}
              blocked={crossBlocked}
              onExpired={session.expire}
              onReport={live.adopt}
              onRestore={(r) => {
                if (
                  canAdoptReport(
                    findSavedGeneration(localStorage)?.reportId,
                    r.id,
                  )
                )
                  live.adopt(r);
              }}
              restoreAllowed={!saved && !recoveryBlocked}
              detailsSlot={detailsSlot}
              onReset={live.clear}
              onRecommend={(r) =>
                live.recommend(r, live.recommendation.state === "failed")
              }
              onExplore={() => open("examples")}
              onBusy={(b) => {
                setResearchBusy(b);
                if (!b) setUsageRefresh((n) => n + 1);
              }}
            />
            <Journey
              flow={live}
              authenticated={session.authenticated}
              blocked={examples.locked || researchBusy || recoveryBlocked}
            />
            <div ref={setDetailsSlot} />
          </section>
          <section
            aria-labelledby="view-examples"
            hidden={view !== "examples"}
          >
            <header className="view-header">
              <h1
                id="view-examples"
                tabIndex={-1}
                ref={(el) => {
                  headings.current.examples = el;
                }}
              >
                Examples
              </h1>
              <p>
                Two fictional businesses, two different starting points. See
                how evidence changes the recommended scope.
              </p>
            </header>
            <nav className="examples" aria-label="Choose an example">
              {reports.map((r, i) => (
                <button
                  key={r.id}
                  disabled={crossBlocked || researchBusy}
                  aria-pressed={examples.report?.id === r.id}
                  onClick={() => examples.adopt(r)}
                >
                  <span>0{i + 1}</span>
                  <strong>{i === 0 ? "No website" : "Existing website"}</strong>
                  <small>{r.businessName}</small>
                </button>
              ))}
            </nav>
            <p className="caption">
              {examples.report?.id === "no-website"
                ? "The owner confirms there is no website. A foundation comes before additional content."
                : "An existing site needs a clearer enquiry flow. A rebuild would add unnecessary scope."}
            </p>
            <Journey
              flow={examples}
              authenticated={session.authenticated}
              blocked={live.locked || researchBusy || recoveryBlocked}
            />
          </section>
          {session.authenticated && (
            <section
              aria-labelledby="view-proposals"
              hidden={view !== "proposals"}
            >
              <header className="view-header">
                <h1
                  id="view-proposals"
                  tabIndex={-1}
                  ref={(el) => {
                    headings.current.proposals = el;
                  }}
                >
                  Proposals
                </h1>
              </header>
              <ProposalsList
                proposals={proposals}
                filter={filter}
                onClearFilter={() => setFilter(null)}
              />
            </section>
          )}
          <p className="fineprint">
            Sample prices · Fictional examples · Proposals are created as
            unsent drafts
          </p>
        </main>
      </div>
    </>
  );
}
