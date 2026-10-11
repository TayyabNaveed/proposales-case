"use client";
import { useEffect, useState } from "react";
import { money } from "../../domain/catalogue";
import type { ProposalWorkflow } from "./useProposalWorkflow";
import { CreateProposalDialog } from "./CreateProposalDialog";
import { Toast } from "./Toast";
import { Spinner } from "./Spinner";
export function ProposalView({
  flow,
  authenticated,
  blocked,
}: {
  flow: ProposalWorkflow;
  authenticated: boolean;
  blocked: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const outcomeAlert = ["rejected", "expired", "verification_failed"].includes(
    flow.outcome?.state ?? "",
  );
  useEffect(() => {
    if (!authenticated) setCreating(false);
  }, [authenticated]);
  return (
    // Once services are suggested, the next step stays docked at the bottom of
    // the screen, with the business name and totals for context.
    <section
      className={"review" + (flow.recommendation.selection ? " docked" : "")}
      aria-label="Create and review"
    >
      {creating && authenticated && flow.report && (
        <CreateProposalDialog
          flow={flow}
          onExpired={flow.expire}
          onCancel={() => setCreating(false)}
          onConfirm={(p) => {
            setCreating(false);
            void flow.generate(p);
          }}
        />
      )}
      <Toast
        notice={flow.notice}
        link={
          flow.notice?.tone !== "error" ? flow.outcome?.editorUrl : undefined
        }
        onDismiss={flow.dismissNotice}
      />
      <div className="review-summary">
        <p className="eyebrow">03 / CREATE & REVIEW</p>
        <h2>Proposal for {flow.report?.businessName ?? "this business"}</h2>
        <dl className="totals">
          <div>
            <dt>Core</dt>
            <dd>
              {money(flow.preview?.coreOneTimeMinor ?? 0)}
              <em> once</em>
              {!!flow.preview?.coreMonthlyMinor && (
                <>
                  {" + "}
                  {money(flow.preview.coreMonthlyMinor)}
                  <em>/month</em>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Optional</dt>
            <dd>
              {money(flow.preview?.optionalOneTimeMinor ?? 0)}
              <em> once</em>
              {!!flow.preview?.optionalMonthlyMinor && (
                <>
                  {" + "}
                  {money(flow.preview.optionalMonthlyMinor)}
                  <em>/month</em>
                </>
              )}
            </dd>
          </div>
        </dl>
        <p className="tax">
          Sample prices exclude tax. Optional extras start unselected.
        </p>
        {flow.error && <p role="alert">{flow.error}</p>}
      </div>
      <div className="actions">
        {!authenticated ? (
          <p>Unlock access from the sidebar to create a proposal.</p>
        ) : (
          <>
            {!flow.pending && !flow.outcome?.providerId && (
              <button
                className="primary"
                disabled={!flow.canGenerate || blocked}
                onClick={() => setCreating(true)}
              >
                Create proposal
              </button>
            )}
            {flow.pending && (
              <>
                <button
                  disabled={!!flow.busy || !authenticated}
                  onClick={() => void flow.checkDraft()}
                >
                  Check proposal progress
                </button>
                {!flow.outcome?.providerId && (
                  <button
                    disabled={!!flow.busy || flow.restoring}
                    onClick={() => void flow.generate()}
                  >
                    Retry saved proposal request
                  </button>
                )}
              </>
            )}
            {flow.outcome?.editorUrl && (
              <a
                className="button-link primary"
                href={flow.outcome.editorUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {flow.outcome.state === "confirmed"
                  ? "Open in Proposales"
                  : "Inspect existing proposal"}
              </a>
            )}
            {flow.outcome?.state === "rejected" && (
              <p role="alert">
                Proposales rejected this proposal, so nothing was created.
                Adjust the scope if needed and create it again.
              </p>
            )}
            {flow.outcome?.state === "expired" && (
              <p role="alert">
                These suggestions expired before the saved request reached the
                server, so nothing was created. Request fresh suggestions to
                continue.
              </p>
            )}
            {flow.outcome?.state === "verification_failed" && (
              <p role="alert">
                {flow.outcome.issues?.includes("recipient")
                  ? "Created, but Proposales shows a different recipient: it already had a contact with this email and kept that contact’s company. Check the recipient in Proposales."
                  : "A proposal exists, but we couldn’t confirm all its details. Inspect that proposal before proceeding."}
              </p>
            )}
            {flow.outcome?.providerId && (
              <button disabled={!!flow.busy} onClick={flow.newVersion}>
                Start another version
              </button>
            )}
          </>
        )}
        <small
          className={
            flow.recommendation.state === "recorded" && !flow.outcome
              ? "hint"
              : undefined
          }
        >
          {flow.recommendation.state === "recorded" && !flow.outcome
            ? "First choose “Prepare this example” under the suggested services."
            : "Creates an unsent draft. You review and send it in Proposales."}
        </small>
        <p role="status" aria-live="polite" className="action-status">
          {flow.busy && <Spinner />}
          {flow.busy ||
            // The alert above already explains this outcome; say it once.
            (outcomeAlert && flow.message === flow.outcome?.message
              ? ""
              : flow.message)}
        </p>
      </div>
    </section>
  );
}
