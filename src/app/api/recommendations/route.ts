import { apiHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(req: Request) {
  return apiHandlers().recommendationsPOST(req);
}
export async function GET(req: Request) {
  return apiHandlers().recommendationsGET(req);
}
