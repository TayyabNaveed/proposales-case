import { researchHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 45;
export const POST = withRequestLog("identify", (req) =>
  researchHandlers().identifyPOST(req),
);
export const GET = withRequestLog("identify", (req) =>
  researchHandlers().GET(req, "identify"),
);
