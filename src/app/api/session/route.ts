import { cookies } from "next/headers";
import { z } from "zod";
import {
  checkCode,
  loginBuckets,
  makeSession,
  sessionCookieSecure,
} from "../../../server/access";
import { sameOrigin, smallJson, safeError } from "../../../server/http";
import { consumeLoginAttempt } from "../../../server/access-store";
import { database } from "../../../server/runtime";
import { hasSession } from "../../../server/session";
export async function GET() {
  return Response.json({ authenticated: await hasSession() });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const secret = process.env.SESSION_SECRET;
    if (!secret || !process.env.REVIEWER_ACCESS_CODE)
      throw new Error("access_unconfigured");
    // Every bucket is consumed so a blocked visitor still counts toward the global cap.
    const allowed = await Promise.all(
      loginBuckets(req, secret).map((b) =>
        consumeLoginAttempt(database(), b.bucket, "case_workflow", b.limit),
      ),
    );
    if (allowed.includes(false))
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
