import { usageHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const GET = withRequestLog("usage", (req) => usageHandlers().GET(req));
