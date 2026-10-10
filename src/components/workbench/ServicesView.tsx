import { canRestartRecommendation } from "../../domain/workbench";
import { catalogueV2, money } from "../../domain/catalogue";
import { presentServices } from "../../domain/presentation";
import type { ProposalWorkflow } from "./useProposalWorkflow";
import { friendlyDate } from "./api";
export function ServicesView({
  flow,
  authenticated,
  blocked,
}: {
  flow: ProposalWorkflow;
  authenticated: boolean;
  blocked: boolean;
}) {
  const rec = flow.recommendation;
  const items = presentServices(
    rec.selection?.items.map((i) => ({
      ...i,
      disposition:
        flow.selected.find((p) => p.serviceId === i.serviceId)?.disposition ??
        i.disposition,
    })) ?? [],
    catalogueV2,
  );
  return (
    <section className="services">
      <p className="eyebrow">02 / SUGGEST & TAILOR</p>
      <h2>A scope that fits.</h2>
      <p className="caption">
        {rec.state === "recorded"
          ? "Recorded example suggestions."
          : rec.state === "none"
            ? "Service suggestions appear after analysis."
            : rec.state === "ready"
              ? `Suggestions saved ${friendlyDate(rec.createdAt)}.`
              : "Suggestions need another check."}{" "}
        Sample prices exclude tax.
      </p>
      {items.length > 0 &&
        (["core", "optional"] as const).map((group) => (
          <div className="service-group" key={group}>
            {items.some((i) => i.disposition === group) && (
              <h3>{group === "core" ? "Core services" : "Optional extras"}</h3>
            )}
            {items
              .filter((i) => i.disposition === group)
              .map((item) => {
                const service = catalogueV2.services.find(
                    (s) => s.id === item.serviceId,
                  )!,
                  pick = flow.selected.find((p) => p.serviceId === service.id);
                const foundation =
                  service.requires === "website"
                    ? "Website foundation"
                    : service.requires === "campaign"
                      ? "An existing campaign or Search ads setup"
                      : service.requires === "profile"
                        ? "A confirmed business profile"
                        : null;
                return (
                  <article
                    className={"service " + (pick ? "chosen" : "")}
                    key={service.id}
                  >
                    <label className="service-heading">
                      <input
                        type="checkbox"
                        checked={!!pick}
                        disabled={blocked || flow.locked}
                        onChange={(e) =>
                          flow.edit(service.id, e.target.checked ? {} : null)
                        }
                      />
                      <strong>{service.title}</strong>
                      <span>
                        {money(service.unitPriceMinor)}
                        <small>
                          {service.billing === "monthly"
                            ? "/ month"
                            : "per unit · once"}
                        </small>
                      </span>
                    </label>
                    <p>{service.deliverables.join(" · ")}</p>
                    <p className="reason">{item.rationale}</p>
                    {foundation && (
                      <small className="prerequisite">
                        Requires {foundation.toLowerCase()}.
                      </small>
                    )}
                    {pick && (
                      <div className="service-controls">
                        {item.quantity > 1 && (
                          <label>
                            Quantity{" "}
                            <select
                              disabled={blocked || flow.locked}
                              value={pick.quantity}
                              onChange={(e) =>
                                flow.edit(service.id, {
                                  quantity: Number(e.target.value),
                                })
                              }
                            >
                              {Array.from({ length: item.quantity }, (_, i) => (
                                <option key={i} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          Include as{" "}
                          <select
                            disabled={blocked || flow.locked}
                            value={pick.disposition}
                            onChange={(e) =>
                              flow.edit(service.id, {
                                disposition: e.target.value as
                                  "core" | "optional",
                              })
                            }
                          >
                            <option value="core">Core service</option>
                            <option value="optional">Optional extra</option>
                          </select>
                        </label>
                      </div>
                    )}
                    <details>
                      <summary>Scope and supporting findings</summary>
                      <p>Excludes: {service.exclusions.join("; ")}</p>
                      {item.findingIds.map((id) => (
                        <p key={id}>
                          {
                            flow.report?.findings.find((f) => f.id === id)
                              ?.claim
                          }
                        </p>
                      ))}
                    </details>
                  </article>
                );
              })}
          </div>
        ))}
      {rec.selection?.abstentionReason && (
        <div className="empty">{rec.selection.abstentionReason}</div>
      )}
      {!!rec.selection?.questions.length && (
        <details className="principle">
          <summary>
            Confirm before sending ({rec.selection.questions.length})
          </summary>
          <ul>
            {rec.selection.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </details>
      )}
      {authenticated && (
        <div className="ai-actions">
          {rec.state !== "ready" && (
            <button
              disabled={blocked || flow.locked}
              onClick={() =>
                void flow
                  .recommend(undefined, canRestartRecommendation(rec))
                  .catch(() => {})
              }
            >
              {rec.state === "recorded"
                ? "Prepare this example"
                : canRestartRecommendation(rec)
                  ? "Try suggestions again"
                  : "Continue to suggestions"}
            </button>
          )}
          {rec.state === "running" && (
            <button
              disabled={blocked || !!flow.busy}
              onClick={() => void flow.checkRecommendation()}
            >
              Check saved progress
            </button>
          )}
        </div>
      )}
      <details className="technical">
        <summary>Technical details</summary>
        <p>
          {rec.model ?? "Model not recorded"} ·{" "}
          {rec.promptVersion ?? "Prompt not recorded"} ·{" "}
          {rec.cacheHit ? "Reused saved result" : rec.state}
        </p>
        {rec.usage && (
          <p>
            Input {rec.usage.inputTokens ?? "unknown"} / output{" "}
            {rec.usage.outputTokens ?? "unknown"} tokens
          </p>
        )}
        {rec.state === "ready" && authenticated && (
          <button
            disabled={blocked || flow.locked}
            onClick={() => void flow.recommend(undefined, true).catch(() => {})}
          >
            Request fresh suggestions
          </button>
        )}
      </details>
    </section>
  );
}
