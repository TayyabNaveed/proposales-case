import { introHandlers } from "../../../server/services";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(req: Request) {
  return introHandlers().POST(req);
}
