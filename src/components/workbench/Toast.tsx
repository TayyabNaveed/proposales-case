"use client";
import { useEffect } from "react";
import type { CreateNotice } from "../../domain/workbench";
// A short notice after creating a proposal or checking its progress. Successes
// clear themselves; warnings and errors stay a little longer. Each can be closed.
export function Toast({
  notice,
  link,
  onDismiss,
}: {
  notice: (CreateNotice & { id: number }) | null;
  link?: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      onDismiss,
      notice.tone === "success" ? 6000 : 12000,
    );
    return () => clearTimeout(timer);
  }, [notice?.id]);
  if (!notice) return null;
  return (
    <div
      className={"toast toast-" + notice.tone}
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
    >
      <p>{notice.text}</p>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer">
          Open in Proposales
        </a>
      )}
      <button type="button" aria-label="Dismiss notice" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
