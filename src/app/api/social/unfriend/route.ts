import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ipRateLimit, rateLimit, readJsonBody } from "@/lib/api-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    if (!ipRateLimit(req, 20, 60_000)) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!rateLimit(`unfriend:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    }

    const body = await readJsonBody<{ friendId?: unknown }>(req, 1_000);
    if (!body.ok) return body.response;
    const { friendId } = body.data;
    if (typeof friendId !== "string" || !UUID_RE.test(friendId))
      return NextResponse.json({ ok: false, error: "Invalid friendId" }, { status: 400 });

    // Use service role to bypass RLS
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete both directions
    await admin.from("friend_requests").delete().eq("from_id", user.id).eq("to_id", friendId);
    await admin.from("friend_requests").delete().eq("from_id", friendId).eq("to_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
