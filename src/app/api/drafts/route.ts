import { apiHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  return apiHandlers().draftsPOST(req);
}
export async function GET(req: Request) {
  return apiHandlers().draftsGET(req);
}
