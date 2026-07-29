import { NextRequest, NextResponse } from "next/server";
import { requirePro, ipRateLimit } from "@/lib/api-guard";

const LIMIT = 20;

// GET — read-only lookup of today's AI usage. Does NOT increment the
// counter (that only happens inside /api/analyze when a request actually
// runs) — this just powers the "X/20 used today" display.
export async function GET(req: NextRequest) {
  try {
    if (!ipRateLimit(req, 30, 60_000)) {
      return NextResponse.json({ used: 0, limit: LIMIT, isPro: false }, { status: 429 });
    }

    const guard = await requirePro();
    if (!guard.ok) return NextResponse.json({ used: 0, limit: LIMIT, isPro: false });

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await admin
      .from("ai_usage")
      .select("count")
      .eq("user_id", guard.userId)
      .eq("day", today)
      .maybeSingle();

    return NextResponse.json({ used: data?.count ?? 0, limit: LIMIT, isPro: true });
  } catch {
    return NextResponse.json({ used: 0, limit: LIMIT, isPro: false });
  }
}
