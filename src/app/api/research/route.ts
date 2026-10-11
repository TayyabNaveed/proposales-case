import { researchHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = withRequestLog("research", (req) =>
  researchHandlers().searchPOST(req),
);
export const GET = withRequestLog("research", (req) =>
  researchHandlers().GET(req, "search"),
);
