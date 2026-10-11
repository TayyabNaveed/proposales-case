import { usageHandlers } from "../../../server/services";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return usageHandlers().GET(req);
}
