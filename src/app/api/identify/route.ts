import { researchHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(req: Request) {
  return researchHandlers().identifyPOST(req);
}
export async function GET(req: Request) {
  return researchHandlers().GET(req, "identify");
}
