"use client";
import { useEffect, useRef, useState } from "react";
import { reports, reportSchema, type ReportV2 } from "../domain/reports";
import { findSavedGeneration, canAdoptReport } from "../domain/workbench";
import { apiRequest } from "./workbench/api";
import { ResearchPanel } from "./ResearchPanel";
import { UsageLine } from "./workbench/UsageLine";
import { useDemoSession } from "./workbench/useDemoSession";
import {
  useProposalWorkflow,
  type ProposalWorkflow,
} from "./workbench/useProposalWorkflow";
import { ReportView } from "./workbench/ReportView";
import { ServicesView } from "./workbench/ServicesView";
import { ProposalView } from "./workbench/ProposalView";
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
        <ReportView report={flow.report} />
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
export function ExampleWorkbench() {
  const session = useDemoSession(),
    live = useProposalWorkflow(null, session),
    examples = useProposalWorkflow(reports[0], session);
  const [tab, setTab] = useState<"research" | "examples">("research"),
    [code, setCode] = useState(""),
    [researchBusy, setResearchBusy] = useState(false),
    // Bumped when research or suggestions finish, so the usage line reloads.
    [usageRefresh, setUsageRefresh] = useState(0);
  const [saved, setSaved] =
      useState<ReturnType<typeof findSavedGeneration>>(null),
    [recoveryMessage, setRecoveryMessage] = useState(""),
    [recoveryBlocked, setRecoveryBlocked] = useState(true);
  useEffect(() => {
    const scan = () => {
      try {
        setSaved(findSavedGeneration(localStorage));
        setRecoveryBlocked(false);
      } catch {
        setRecoveryBlocked(true);
        setRecoveryMessage(
          "Saved proposal recovery could not be read. Enable browser storage before creating another proposal.",
        );
      }
    };
    scan();
    window.addEventListener("case-generation-changed", scan);
    window.addEventListener("storage", scan);
    return () => {
      window.removeEventListener("case-generation-changed", scan);
      window.removeEventListener("storage", scan);
    };
  }, []);
  useEffect(() => {
    if (!saved) return;
    setTab(saved.reportId.startsWith("live-") ? "research" : "examples");
    if (!session.authenticated) return;
    let cancelled = false;
    setRecoveryBlocked(true);
    apiRequest<{ recommendation: { report: ReportV2 } }>(
      "/api/recommendations?id=" +
        encodeURIComponent(saved.request.recommendationId),
      undefined,
      session.expire,
    )
      .then((v) => {
        if (cancelled) return;
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  function navigate(index: number) {
    setTab(index === 0 ? "research" : "examples");
    tabRefs.current[index]?.focus();
  }
  function tabKey(e: React.KeyboardEvent, index: number) {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowLeft"
        ? 1 - index
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1
            : null;
    if (next !== null) {
      e.preventDefault();
      navigate(next);
    }
  }
  const crossBlocked =
    live.locked || examples.locked || !!saved || recoveryBlocked;
  return (
    <main>
      <header className="topbar">
        <a href="/" className="brand">
          <span className="mark">f.</span> fieldwork
        </a>
        <span className="topnote">METASCALERS × PROPOSALES</span>
        <span className="pill">Case demo</span>
      </header>
      <section className="intro">
        <p className="eyebrow">FROM BUSINESS TO PROPOSAL</p>
        <h1>
          Understand the business.
          <br />
          Propose what fits.
        </h1>
        <p className="lede">
          Explore public information, suggest useful services, and prepare a
          proposal for review in Proposales.
        </p>
        <p className="notice">
          Sample prices · Fictional examples · Proposals created as unsent
          drafts
        </p>
      </section>
      <div role="tablist" aria-label="Choose a workflow" className="main-tabs">
        {(["research", "examples"] as const).map((name, index) => (
          <button
            key={name}
            id={"tab-" + name}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            aria-controls={"panel-" + name}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => tabKey(e, index)}
          >
            {name === "research" ? "Research a business" : "Explore examples"}
          </button>
        ))}
      </div>
      <section className="access-panel" aria-label="Demo access">
        {session.checking ? (
          <p>Checking demo access…</p>
        ) : session.authenticated ? (
          <>
            <p>
              <span className="access-dot" /> Demo access active{" "}
              <small>Review the proposal in Proposales before sending.</small>
            </p>
            <UsageLine refresh={usageRefresh} />
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void session.login(code).then(() => setCode(""));
            }}
          >
            <label htmlFor="demo-code">
              Demo access code{" "}
              <input
                id="demo-code"
                type="password"
                required
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button disabled={session.busy}>
              {session.busy ? "Opening access…" : "Unlock access"}
            </button>
            <small>
              Examples are free to explore. Access enables analysis and proposal
              creation.
            </small>
          </form>
        )}
        {session.message && <p role="status">{session.message}</p>}
      </section>
      {recoveryMessage && saved && (
        <p role="status" className="recovery-note">
          {recoveryMessage}
        </p>
      )}
      <div
        role="tabpanel"
        id="panel-research"
        aria-labelledby="tab-research"
        hidden={tab !== "research"}
        tabIndex={0}
      >
        <ResearchPanel
          authenticated={session.authenticated}
          blocked={crossBlocked || session.checking}
          onExpired={session.expire}
          onReport={live.adopt}
          onRestore={(r) => {
            if (
              canAdoptReport(findSavedGeneration(localStorage)?.reportId, r.id)
            )
              live.adopt(r);
          }}
          restoreAllowed={!saved && !recoveryBlocked}
          onReset={live.clear}
          onRecommend={(r) =>
            live.recommend(r, live.recommendation.state === "failed")
          }
          onExplore={() => setTab("examples")}
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
        {!live.report && !researchBusy && (
          <div className="starting-note">
            <h2>Start with a name and a place.</h2>
            <p>
              We’ll look for public sources, identify useful opportunities and
              keep anything uncertain visible.
            </p>
            <small>
              Closing this page may pause analysis. Saved work can be continued
              when you return.
            </small>
          </div>
        )}
      </div>
      <div
        role="tabpanel"
        id="panel-examples"
        aria-labelledby="tab-examples"
        hidden={tab !== "examples"}
        tabIndex={0}
      >
        <p className="example-caption">
          Two fictional businesses, two different starting points. See how
          evidence changes the recommended scope.
        </p>
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
      </div>
      <footer>
        <span>Built for thoughtful handoffs.</span>
        <span>Understand → suggest → create → review in Proposales</span>
      </footer>
    </main>
  );
}
