"use client";
import { useEffect, useRef, useState } from "react";
import type { ProposalPresentation } from "../../domain/offers";
import { contactSuggestions } from "../../domain/contacts";
import type { ProposalWorkflow } from "./useProposalWorkflow";
import { apiRequest } from "./api";
import { Spinner } from "./Spinner";

type Intro = { state: string; text: string; dropped: number; errorCode: string | null };

// The last step before creating: the AI drafts a short introduction, the operator
// edits it and sets the recipient. Nothing here is required; nothing is sent.
export function CreateProposalDialog({
  flow,
  onConfirm,
  onCancel,
  onExpired,
}: {
  flow: ProposalWorkflow;
  onConfirm(p: ProposalPresentation): void;
  onCancel(): void;
  onExpired(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const report = flow.report!;
  const emails = contactSuggestions(report);
  const [intro, setIntro] = useState(""),
    [drafting, setDrafting] = useState(true),
    [note, setNote] = useState(""),
    [company, setCompany] = useState(report.businessName),
    [contact, setContact] = useState(""),
    [email, setEmail] = useState(emails[0] ?? ""),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let cancelled = false;
    apiRequest<{ intro: Intro }>(
      "/api/intro",
      { recommendationId: flow.recommendation.id, selections: flow.selected },
      onExpired,
    )
      .then(({ intro }) => {
        if (cancelled) return;
        setIntro(intro.text);
        setNote(
          intro.state === "ready" && intro.text
            ? "Drafted by AI from the report and your scope. Edit freely."
            : "No introduction could be drafted. Write one, or leave it empty.",
        );
      })
      .catch(() => !cancelled && setNote("No introduction could be drafted. Write one, or leave it empty."))
      .finally(() => !cancelled && setDrafting(false));
    return () => {
      cancelled = true;
      element?.close();
    };
  }, []);
  function submit() {
    const address = email.trim();
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address, or leave it empty.");
      return;
    }
    onConfirm({
      intro: intro.trim(),
      ...(company.trim()
        ? {
            recipient: {
              companyName: company.trim(),
              ...(contact.trim() ? { contactName: contact.trim() } : {}),
              ...(address ? { email: address } : {}),
            },
          }
        : {}),
    });
  }
  const questions = flow.recommendation.selection?.questions ?? [];
  return (
    <dialog
      ref={dialog}
      className="choice-dialog"
      aria-labelledby="create-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="create-title">Before creating the proposal</h2>
        <fieldset>
          <legend>Introduction</legend>
          <label className="choice-typed">
            <textarea
              rows={6}
              maxLength={1500}
              value={intro}
              disabled={drafting}
              placeholder={drafting ? "Drafting a tailored introduction…" : "Optional"}
              onChange={(e) => setIntro(e.target.value)}
            />
          </label>
          <small aria-live="polite">
            {drafting && <Spinner />}
            {drafting ? "Drafting a tailored introduction…" : note}
          </small>
        </fieldset>
        <fieldset>
          <legend>
            Recipient <small>(optional)</small>
          </legend>
          <label className="choice-typed">
            Company
            <input value={company} maxLength={160} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label className="choice-typed">
            Contact name
            <input value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} />
          </label>
          <label className="choice-typed">
            Email
            <input
              type="email"
              list="email-suggestions"
              value={email}
              maxLength={254}
              aria-invalid={!!error}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
            />
            <datalist id="email-suggestions">
              {emails.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </label>
          <small className={error ? "error" : undefined}>
            {error ||
              (emails.length
                ? "Suggested from the business’s public sources."
                : "No email found in the sources.")}{" "}
            {!email.trim() &&
              "Proposales needs an email for a recipient, so without one the draft is created without a recipient. "}
            Nothing is sent; you send from Proposales.
          </small>
        </fieldset>
        {!!questions.length && (
          <div className="principle">
            <h3>To confirm with the client</h3>
            <ul>
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <small>For you only; these are not added to the proposal.</small>
          </div>
        )}
        <div className="choice-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" disabled={drafting}>
            Create proposal
          </button>
        </div>
      </form>
    </dialog>
  );
}
