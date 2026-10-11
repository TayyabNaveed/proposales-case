import { apiHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = withRequestLog("drafts", (req) =>
  apiHandlers().draftsPOST(req),
);
export const GET = withRequestLog("drafts", (req) =>
  apiHandlers().draftsGET(req),
);
