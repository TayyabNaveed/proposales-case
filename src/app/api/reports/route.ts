import { researchHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 65;
export const POST = withRequestLog("reports", (req) =>
  researchHandlers().reportPOST(req),
);
export const GET = withRequestLog("reports", (req) =>
  researchHandlers().GET(req, "report"),
);
