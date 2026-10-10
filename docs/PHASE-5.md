# Phase 5 — bounded live research

Verified locally on 10 October 2026. Name/location/optional website → Tavily sources → DeepSeek sourced report → existing service selector → deterministic prices → existing unsent Proposales draft path. Review the actual proposal once in Proposales before manual sending.

## Try it

Unlock demo access at http://127.0.0.1:3001 with the locally configured code. Enter a business and choose Search public sources, Build sourced report, Use this report and Get AI recommendations. Sources include URLs/excerpts/retrieval times. Search, report and selection have separate caches. Reload restores saved source/report pointers; using the report is explicit. Status reads never dispatch paid work. Failed stages require explicit retry; interrupted report restart becomes available after 180 seconds.

Search: three basic queries, concurrency two, five results/query, eight unique excerpts up to 1,500 characters. At most one safe-read retry, 20 seconds/request and 120 seconds/stage. Report: one model call, no SDK retry, 55 seconds and 2,400 output tokens. Separate scoped/versioned successful caches last 24 hours; ten new admissions per stage/scope/UTC day. Partial/failed records are preserved. Sources remain untrusted; the app fetches only the fixed Tavily endpoint, never arbitrary source URLs.

## Actual evidence

Public Hotel Diplomat, Stockholm, supplied official website:

| Stage | Result | Recorded use |
|---|---|---|
| Search | 8 sources, 3 queries/attempts, 3.630 seconds | 3 Tavily credits |
| Final report | Confirmed identity, 8 findings, 3.328 seconds | 2,972 input / 755 output tokens; 2,816 cache-read input tokens |
| Selection | Optional AI visibility foundations audit, EUR250 once; core EUR0 | 3,538 input / 145 output tokens; 1,280 cache-read input tokens |

Cache-read tokens are subsets of input tokens. Two earlier report attempts failed validation and remain failed: first usage unavailable; diagnostic second call 2,972 input / 550 output / 2,816 cache-read. These are additional calls, not included in the successful report row. Neither reran Tavily. Actual output exposed overly strict whitespace and percentage checks; regression fixes allow whitespace-normalized quotations and literal sourced discounts while retaining unsupported-performance guards. Prompt version is research-report-2. No new account draft or email was created for this live business.

Author checked every final finding against saved excerpts and read the recommendation. Existing website was supported; profile/campaign/analytics/budget/goals remain unknown. The optional audit is a conditional opportunity, not proof of a visibility deficiency. Third-party meeting information and review opinions may be stale or subjective. Quoted support and name/location heuristics do not prove truth, source reliability or universal prompt-injection resistance. Confirm requirements before sending.

An initial local HTTP database timing failure occurred before provider admission; standalone database checks were healthy and restart resolved it. Exact cause was not established.

## Verification and remaining limits

108 offline tests, TypeScript, production build, isolated research database 2/2 and local HTTP 1/1 passed. Browser confirmed authenticated cached source/report/selection, live evidence and EUR250 optional price, draft action availability and 375px layout without overflow. No extra paid calls or provider writes during browser checks.

One independent fallback review completed after the first reviewer hit its usage limit. Qualified website-absence claims, mixed identity support and interrupted-run UI restart findings were fixed with RED→GREEN regressions. Deferred minor: malformed HTTP200 Tavily JSON/schema/size failures can consume the single allowed search retry; total remains at most four attempts and usage may be unknown. Production role/proxy configuration, hosting and final provider visual acceptance remain later work. No Git remote, deployment, sharing, automatic email or webhook flow.
