import { researchHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request) {
  return researchHandlers().searchPOST(req);
}
export async function GET(req: Request) {
  return researchHandlers().GET(req, "search");
}
