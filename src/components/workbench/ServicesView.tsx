import { useState } from "react";
import {
  canRestartRecommendation,
  serviceAvailability,
} from "../../domain/workbench";
import { catalogueV2, money } from "../../domain/catalogue";
import { presentServices } from "../../domain/presentation";
import { proposalCategories } from "../../domain/proposal-groups";
import type { ProposalWorkflow } from "./useProposalWorkflow";
import { friendlyDate } from "./api";
import { Spinner } from "./Spinner";
type Service = (typeof catalogueV2.services)[number];
// Quantity (within catalogue bounds) and core/optional, for any chosen service.
function ServiceControls({
  flow,
  service,
  pick,
  disabled,
  suggestedQuantity,
}: {
  flow: ProposalWorkflow;
  service: Service;
  pick: { quantity: number; disposition: "core" | "optional" };
  disabled: boolean;
  suggestedQuantity?: number;
}) {
  return (
    <div className="service-controls">
      {service.maxQuantity > 1 && (
        <label>
          Quantity{" "}
          <select
            disabled={disabled}
            value={pick.quantity}
            onChange={(e) =>
              flow.edit(service.id, { quantity: Number(e.target.value) })
            }
          >
            {Array.from({ length: service.maxQuantity }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
                {suggestedQuantity === i + 1 ? " (suggested)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Include as{" "}
        <select
          disabled={disabled}
          value={pick.disposition}
          onChange={(e) =>
            flow.edit(service.id, {
              disposition: e.target.value as "core" | "optional",
            })
          }
        >
          <option value="core">Core service</option>
          <option value="optional">Optional extra</option>
        </select>
      </label>
    </div>
  );
}
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
  // Expired suggestions can no longer become a proposal; offer a refresh.
  const expired =
    rec.state === "ready" &&
    !!rec.expiresAt &&
    Date.parse(rec.expiresAt) <= Date.now();
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
      {(flow.busy === "Suggesting services" ||
        flow.busy === "Checking saved suggestions") && (
        <p className="loading-note" role="status">
          <Spinner />
          {flow.busy === "Suggesting services"
            ? "Choosing services that fit this business. This usually takes 5–30 seconds."
            : "Checking saved suggestions."}
        </p>
      )}
      {items.length > 0 && (
        <h3 className="block-title">Suggested for this business</h3>
      )}
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
                      <ServiceControls
                        flow={flow}
                        service={service}
                        pick={pick}
                        disabled={blocked || flow.locked}
                        suggestedQuantity={item.quantity}
                      />
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
      {rec.selection && !items.length && (
        <div className="no-suggestions">
          <strong>No services suggested</strong>
          <p>
            The research didn’t show a clear need that one of these services
            would solve, so nothing is preselected. Choose the services you want
            to offer below.
          </p>
          {rec.selection.abstentionReason && (
            <details>
              <summary>Why nothing was suggested</summary>
              <p>{rec.selection.abstentionReason}</p>
            </details>
          )}
        </div>
      )}
      {rec.selection && flow.report && (
        <ServiceCatalogue
          flow={flow}
          blocked={blocked}
          suggested={items.length > 0}
        />
      )}
      {!!rec.selection?.questions.length && (
        <div className="principle compact">
          <h3>Before sending, confirm with the client</h3>
          <ul>
            {rec.selection.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {authenticated && (
        <div className="ai-actions">
          {(rec.state !== "ready" || expired) && (
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
                : expired
                  ? "Refresh expired suggestions"
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

// The rest of the catalogue, one category at a time, so the operator can add
// what the AI did not suggest. Added services are attributed to the operator.
function ServiceCatalogue({
  flow,
  blocked,
  suggested: hasSuggestions,
}: {
  flow: ProposalWorkflow;
  blocked: boolean;
  suggested: boolean;
}) {
  const suggested = new Set(
    flow.recommendation.selection?.items.map((i) => i.serviceId),
  );
  const chosen = flow.selected.map((p) => p.serviceId);
  const categories = proposalCategories
    .map((c) => ({
      id: c.id,
      title: c.title,
      services: catalogueV2.services.filter(
        (s) =>
          (c.serviceIds as readonly string[]).includes(s.id) &&
          !suggested.has(s.id),
      ),
    }))
    .filter((c) => c.services.length);
  const [active, setActive] = useState<string>(categories[0]?.id ?? "");
  const current = categories.find((c) => c.id === active) ?? categories[0];
  if (!current || !flow.report) return null;
  return (
    <div className="catalogue">
      <h3 className="block-title">
        {hasSuggestions ? "Add other services" : "Choose services"}
      </h3>
      <p className="caption">
        {hasSuggestions ? "Not suggested for this business. " : ""}
        Anything you add is marked as added by you.
      </p>
      <div
        className="category-pills"
        role="group"
        aria-label="Service categories"
      >
        {categories.map((c) => {
          const added = c.services.filter((s) => chosen.includes(s.id)).length;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === current.id}
              onClick={() => setActive(c.id)}
            >
              {c.title}
              {added > 0 && (
                <span className="pill-count" aria-label={`${added} added`}>
                  {added}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="catalogue-list" aria-label={current.title}>
        {current.services.map((service) => {
          const pick = flow.selected.find((p) => p.serviceId === service.id);
          const state = serviceAvailability(
            service,
            flow.report!,
            chosen.filter((id) => id !== service.id),
          );
          // Shown as unavailable, with the reason first, rather than a silent
          // checkbox that will not tick.
          const unavailable = !pick && !state.available,
            reasonId = "unavailable-" + service.id;
          return (
            <article
              className={
                "service other " +
                (pick ? "chosen" : unavailable ? "unavailable" : "")
              }
              key={service.id}
            >
              <label className="service-heading">
                <input
                  type="checkbox"
                  checked={!!pick}
                  aria-describedby={unavailable ? reasonId : undefined}
                  disabled={blocked || flow.locked || unavailable}
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
              {unavailable && (
                <p className="unavailable-reason" id={reasonId}>
                  {state.reason}
                </p>
              )}
              <p>{service.deliverables.join(" · ")}</p>
              {pick ? (
                <>
                  <small className="added-by">Added by you</small>
                  <ServiceControls
                    flow={flow}
                    service={service}
                    pick={pick}
                    disabled={blocked || flow.locked}
                  />
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
