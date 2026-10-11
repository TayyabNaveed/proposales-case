"use client";
import { useState } from "react";
import { money } from "../../domain/catalogue";
import type { ProposalWorkflow } from "./useProposalWorkflow";
import { CreateProposalDialog } from "./CreateProposalDialog";
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
  return (
    <section className="review">
      {creating && flow.report && (
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
      <div>
        <p className="eyebrow">03 / CREATE & REVIEW</p>
        <h2>Your proposal, ready to review.</h2>
        <p>
          Add a short introduction and the recipient, then create an unsent
          draft and review it in Proposales before sending.
        </p>
        <div className="totals">
          <div>
            <small>CORE · ONCE</small>
            <strong>{money(flow.preview?.coreOneTimeMinor ?? 0)}</strong>
          </div>
          <div>
            <small>CORE · MONTHLY</small>
            <strong>
              {money(flow.preview?.coreMonthlyMinor ?? 0)}
              <em>/ month</em>
            </strong>
          </div>
          <div>
            <small>OPTIONAL · ONCE</small>
            <strong>{money(flow.preview?.optionalOneTimeMinor ?? 0)}</strong>
          </div>
          <div>
            <small>OPTIONAL · MONTHLY</small>
            <strong>
              {money(flow.preview?.optionalMonthlyMinor ?? 0)}
              <em>/ month</em>
            </strong>
          </div>
        </div>
        <p className="tax">
          Sample prices exclude tax. Optional extras start unselected.
        </p>
        {flow.error && <p role="alert">{flow.error}</p>}
      </div>
      <div className="actions">
        {!authenticated ? (
          <p>Enter the demo access code above to create a proposal.</p>
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
            {flow.outcome?.state === "verification_failed" && (
              <p role="alert">
                A proposal exists, but we couldn’t confirm all its details.
                Inspect that proposal before proceeding.
              </p>
            )}
            {flow.outcome?.providerId && (
              <button disabled={!!flow.busy} onClick={flow.newVersion}>
                Start another version
              </button>
            )}
          </>
        )}
        <small>
          Creation sends no email. Review and sending happen in Proposales.
        </small>
        <p role="status" aria-live="polite" className="status">
          {flow.busy || flow.message}
        </p>
      </div>
    </section>
  );
}
