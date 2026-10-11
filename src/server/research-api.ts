import { z } from "zod";
import { account, smallJson, safeError } from "./http.js";
import {
  researchInputSchema,
  operatorChoiceSchema,
  type ResearchInput,
  type OperatorChoice,
} from "../domain/research.js";
import { publicResearch, type ResearchRecord } from "./research.js";
export function createResearchApi(
  deps: {
    consume(scope: string, action: string): Promise<boolean>;
    search(
      input: ResearchInput,
      scope: string,
      refresh: boolean,
    ): Promise<ResearchRecord>;
    identify(
      searchId: string,
      scope: string,
      refresh: boolean,
    ): Promise<ResearchRecord>;
    report(
      searchId: string,
      identifyId: string,
      choice: OperatorChoice,
      scope: string,
      refresh: boolean,
    ): Promise<ResearchRecord>;
    get(id: string, scope: string): Promise<ResearchRecord>;
  },
  env: NodeJS.ProcessEnv = process.env,
) {
  const json = (r: ResearchRecord) =>
    Response.json(
      { record: publicResearch(r) },
      { headers: { "Cache-Control": "no-store" } },
    );
  async function limit(scope: string, action: string) {
    if (!(await deps.consume(scope, action)))
      throw new Error("too_many_attempts");
  }
  return {
    async searchPOST(req: Request) {
      try {
        const scope = account(req, true, env),
          body = z
            .object({
              input: researchInputSchema,
              refresh: z.boolean().default(false),
            })
            .strict()
            .parse(await smallJson(req));
        await limit(scope, "research-write");
        return json(await deps.search(body.input, scope, body.refresh));
      } catch (e) {
        return safeError(e);
      }
    },
    async identifyPOST(req: Request) {
      try {
        const scope = account(req, true, env),
          body = z
            .object({ searchId: z.uuid(), refresh: z.boolean().default(false) })
            .strict()
            .parse(await smallJson(req));
        await limit(scope, "identify-write");
        return json(await deps.identify(body.searchId, scope, body.refresh));
      } catch (e) {
        return safeError(e);
      }
    },
    async reportPOST(req: Request) {
      try {
        const scope = account(req, true, env),
          body = z
            .object({
              searchId: z.uuid(),
              identifyId: z.uuid(),
              choice: operatorChoiceSchema,
              refresh: z.boolean().default(false),
            })
            .strict()
            .parse(await smallJson(req));
        await limit(scope, "report-write");
        return json(
          await deps.report(
            body.searchId,
            body.identifyId,
            body.choice,
            scope,
            body.refresh,
          ),
        );
      } catch (e) {
        return safeError(e);
      }
    },
    async GET(req: Request, stage: "search" | "identify" | "report") {
      try {
        const scope = account(req, false, env),
          id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
        await limit(scope, stage + "-read");
        const r = await deps.get(id, scope);
        if (r.stage !== stage) throw new Error("research_missing");
        return json(r);
      } catch (e) {
        return safeError(e);
      }
    },
  };
}
