import { proposalHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 30;
export const GET = withRequestLog("proposals", (req) =>
  proposalHandlers().GET(req),
);
