import { introHandlers } from "../../../server/services";
import { withRequestLog } from "../../../server/log";
export const runtime = "nodejs";
export const maxDuration = 45;
export const POST = withRequestLog("intro", (req) => introHandlers().POST(req));
