import { apiHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = withRequestLog("recommendations", (req) =>
  apiHandlers().recommendationsPOST(req),
);
export const GET = withRequestLog("recommendations", (req) =>
  apiHandlers().recommendationsGET(req),
);
