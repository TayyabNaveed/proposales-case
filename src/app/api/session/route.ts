import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  checkCode,
  makeSession,
  readSession,
  sessionCookieSecure,
} from "../../../server/access";
import { sameOrigin, smallJson, safeError } from "../../../server/http";
import { consumeLoginAttempt } from "../../../server/access-store";
import { database } from "../../../server/runtime";
export async function GET() {
  const secret = process.env.SESSION_SECRET;
  return Response.json({
    authenticated:
      !!secret &&
      !!readSession((await cookies()).get("case_session")?.value, secret),
  });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const secret = process.env.SESSION_SECRET;
    if (!secret || !process.env.REVIEWER_ACCESS_CODE)
      throw new Error("access_unconfigured");
    // Global persisted limiter deliberately ignores spoofable forwarding headers. Configure trusted proxy identity before hosting.
    const bucket = createHmac("sha256", secret)
      .update("reviewer-login-global")
      .digest("hex");
    if (!(await consumeLoginAttempt(database(), bucket)))
      return Response.json({ error: "too_many_attempts" }, { status: 429 });
    const { code } = z
      .object({ code: z.string().max(200) })
      .strict()
      .parse(await smallJson(req));
    if (!checkCode(code, process.env.REVIEWER_ACCESS_CODE))
      return Response.json({ error: "invalid_access_code" }, { status: 401 });
    (await cookies()).set("case_session", makeSession(secret), {
      httpOnly: true,
      sameSite: "strict",
      secure: sessionCookieSecure(process.env.APP_ORIGIN),
      path: "/",
      maxAge: 3600,
    });
    return Response.json({ authenticated: true });
  } catch (e) {
    return safeError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    (await cookies()).delete("case_session");
    return Response.json({ authenticated: false });
  } catch (e) {
    return safeError(e);
  }
}
