import { proposalHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(req: Request) {
  return proposalHandlers().GET(req);
}
