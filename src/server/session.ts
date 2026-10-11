import { cookies } from "next/headers";
import { readSession } from "./access";
// Whether this request carries a valid demo session. Read on the server so the
// first HTML already matches the visitor's access.
export async function hasSession() {
  const secret = process.env.SESSION_SECRET;
  return (
    !!secret &&
    !!readSession((await cookies()).get("case_session")?.value, secret)
  );
}
