"use client";
import { useEffect, useRef, useState } from "react";
import { publicSourceUrl, type OperatorChoice } from "../../domain/research";
import type { IdentifyStage } from "../../domain/research-state";
import type { ReportV2 } from "../../domain/reports";

type Evidence = ReportV2["evidence"][number];
const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

// The operator's one decision in the guided flow: which business, and its website.
// The business is required. The website can be a verified suggestion, typed in,
// or left empty, which means "no website" and lets a website build be suggested.
export function BusinessChoice({
  businessName,
  identify,
  evidence,
  onConfirm,
  onCancel,
}: {
  businessName: string;
  identify: IdentifyStage;
  evidence: Evidence[];
  onConfirm(choice: OperatorChoice): void;
  onCancel(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const candidates = identify.result?.identity.candidates ?? [];
  const [candidate, setCandidate] = useState<number | null>(
    candidates.length === 1 ? 0 : null,
  );
  const suggestions = (candidate === null ? [] : candidates[candidate].websiteSourceIds ?? [])
    .map((id) => evidence.find((e) => e.id === id))
    .filter((e): e is Evidence => !!e?.url);
  const [site, setSite] = useState<string | null>(null),
    [typed, setTyped] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    // One verified website is preselected; the operator can still clear it.
    setSite(suggestions.length === 1 ? suggestions[0].id : null);
    setTyped("");
    setError("");
  }, [candidate]);
  const source = (id: string) => evidence.find((e) => e.id === id);
  function submit() {
    if (candidate === null) return;
    const url = typed.trim();
    if (url && !publicSourceUrl(url)) {
      setError("Enter a full public website address, such as https://example.com.");
      return;
    }
    onConfirm({
      candidate,
      notes,
      website: url
        ? { kind: "typed", url: publicSourceUrl(url)! }
        : site
          ? { kind: "selected", sourceId: site }
          : { kind: "none" },
    });
  }
  return (
    <dialog
      ref={dialog}
      className="choice-dialog"
      aria-labelledby="choice-title"
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
        <h2 id="choice-title">Which business is this?</h2>
        {!candidates.length ? (
          <p>
            We couldn’t match “{businessName}” to one business in the public
            sources. Check the name and location, then analyse again.
          </p>
        ) : (
          <>
            <p className="caption">
              {candidates.length === 1
                ? "We found one match. Confirm it, and add its website if you know it."
                : "We found more than one match. Choose the right business."}{" "}
              The report and suggestions use only this business’s sources.
            </p>
            <fieldset>
              <legend>Business</legend>
              {candidates.map((c, i) => (
                <label key={i} className="choice-option">
                  <input
                    type="radio"
                    name="candidate"
                    checked={candidate === i}
                    onChange={() => setCandidate(i)}
                  />
                  <span>
                    <strong>{c.name.text}</strong>
                    {c.location && <span> · {c.location.text}</span>}
                    <small>
                      Found in {source(c.name.sourceId)?.label ?? "a source"}
                      {host(source(c.name.sourceId)?.url) &&
                        ` (${host(source(c.name.sourceId)?.url)})`}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {candidate !== null && (
              <fieldset>
                <legend>
                  Website <small>(optional)</small>
                </legend>
                {suggestions.map((e) => (
                  <label key={e.id} className="choice-option">
                    <input
                      type="radio"
                      name="website"
                      checked={site === e.id && !typed}
                      onChange={() => {
                        setSite(e.id);
                        setTyped("");
                      }}
                    />
                    <span>
                      <strong>{host(e.url)}</strong>
                      <small>{e.label}</small>
                    </span>
                  </label>
                ))}
                <label className="choice-typed">
                  {suggestions.length ? "Or type another website" : "Type the website, if it has one"}
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={300}
                    placeholder="https://"
                    value={typed}
                    aria-invalid={!!error}
                    aria-describedby="website-help"
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setError("");
                      if (e.target.value) setSite(null);
                    }}
                  />
                </label>
                <small id="website-help" className={error ? "error" : undefined}>
                  {error ||
                    (!site && !typed.trim()
                      ? "No website selected: suggestions may include building one."
                      : "Suggestions can include improving this website.")}
                </small>
                {site && !typed && (
                  <button type="button" className="text-action" onClick={() => setSite(null)}>
                    This isn’t the business’s website
                  </button>
                )}
              </fieldset>
            )}
            {candidate !== null && (
              <fieldset>
                <legend>
                  Notes from the client <small>(optional)</small>
                </legend>
                <label className="choice-typed">
                  What did the client tell you? Goals, budget, priorities.
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={notes}
                    placeholder="e.g. Call on 11 Oct: wants more corporate clients, around €500/month."
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <small>
                  Used as the client’s goals for the report, suggestions and
                  introduction. Marked as your notes, never as public information.
                </small>
              </fieldset>
            )}
          </>
        )}
        <div className="choice-actions">
          <button type="button" onClick={onCancel}>
            {candidates.length ? "Cancel" : "Close"}
          </button>
          {!!candidates.length && (
            <button className="primary" disabled={candidate === null}>
              Continue
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
