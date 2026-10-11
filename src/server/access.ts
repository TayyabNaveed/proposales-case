import { createHmac, timingSafeEqual } from "node:crypto";
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function checkCode(input: string, expected: string | undefined) {
  return (
    !!expected &&
    equal(
      createHmac("sha256", "access-compare").update(input).digest("hex"),
      createHmac("sha256", "access-compare").update(expected).digest("hex"),
    )
  );
}
export function makeSession(
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  const body = Buffer.from(
    JSON.stringify({ reviewer: "reviewer", expires: now + 3600 }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
export function readSession(
  token: string | undefined,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  try {
    if (!token || token.length > 512 || !secret) return null;
    const [body, sig, ...rest] = token.split(".");
    if (
      rest.length ||
      !body ||
      !sig ||
      !equal(sig, createHmac("sha256", secret).update(body).digest("base64url"))
    )
      return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.reviewer === "reviewer" &&
      Number.isInteger(data.expires) &&
      data.expires > now &&
      data.expires <= now + 3600
      ? "reviewer"
      : null;
  } catch {
    return null;
  }
}
export function checkOrigin(origin: string | null, url: string) {
  try {
    return origin === new URL(url).origin;
  } catch {
    return false;
  }
}
export function sessionCookieSecure(origin: string | undefined) {
  if (!origin) throw new Error("access_unconfigured");
  const url = new URL(origin);
  if (url.protocol === "https:") return true;
  if (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return false;
  throw new Error("access_unconfigured");
}
// Buckets are consumed in order, visitor first, and the first refusal stops. An
// attempt refused by its own visitor bucket never counts toward the global cap,
// so one source cannot lock everyone out by exhausting it.
export async function admitLogin(
  buckets: { bucket: string; limit: number }[],
  consume: (bucket: string, limit: number) => Promise<boolean>,
) {
  for (const b of buckets) if (!(await consume(b.bucket, b.limit))) return false;
  return true;
}
// Vercel overwrites x-forwarded-for with the client address, so it is trusted only
// there. Elsewhere one global bucket applies. Addresses are stored only as HMACs.
export function loginBuckets(
  req: Request,
  secret: string,
  env: Record<string, string | undefined> = process.env,
) {
  const key = (name: string) =>
    createHmac("sha256", secret).update(name).digest("hex");
  const global = { bucket: key("reviewer-login-global"), limit: 5 };
  const ip =
    env.VERCEL === "1"
      ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : undefined;
  if (!ip || ip.length > 64) return [global];
  return [
    { bucket: key("reviewer-login-ip:" + ip), limit: 5 },
    { ...global, limit: 30 },
  ];
}
