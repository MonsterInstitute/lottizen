import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { deleteSession } from "@/lib/supabase-admin";

/** POST /api/auth/logout — revokes the session server-side (not just
 *  clearing the cookie), consistent with this being a real, table-backed
 *  session rather than a stateless token. */
export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await deleteSession(token);
    } catch (e) {
      console.error("[auth/logout] error:", e);
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
