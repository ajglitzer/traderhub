import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const MAX_TRADES = 10000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

/** Strip unknown fields — never trust the client's object shape. */
function sanitizeTrade(t: any) {
  if (!t || typeof t !== "object" || typeof t.id !== "string") return null;
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: any, max = 200) =>
    typeof v === "string" ? v.slice(0, max) : null;

  return {
    id: t.id.slice(0, 100),
    ticker: str(t.ticker, 30),
    side: t.side === "LONG" || t.side === "SHORT" ? t.side : null,
    assetType: str(t.assetType, 20),
    entryPrice: num(t.entryPrice),
    exitPrice: num(t.exitPrice),
    quantity: num(t.quantity),
    entryTime: str(t.entryTime, 40),
    exitTime: str(t.exitTime, 40),
    netPnl: num(t.netPnl),
    grossPnl: num(t.grossPnl),
    commission: num(t.commission),
    stopLoss: num(t.stopLoss),
    takeProfit: num(t.takeProfit),
    status: str(t.status, 20),
    notes: str(t.notes, 2000),
    tags: Array.isArray(t.tags) ? t.tags.slice(0, 20).map((x: any) => String(x).slice(0, 40)) : [],
  };
}

// GET — fetch this user's trades only
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ trades: [] });

    const { data, error } = await supabase
      .from("cloud_trades")
      .select("data")
      .eq("user_id", user.id)
      .limit(MAX_TRADES);

    if (error) return NextResponse.json({ trades: [] });
    return NextResponse.json({ trades: (data || []).map((r: any) => r.data) });
  } catch {
    return NextResponse.json({ trades: [] });
  }
}

// POST — upsert trades scoped to this user
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // Cap body size before parsing
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }

    const body = await req.json();
    const trades = body?.trades;
    if (!Array.isArray(trades)) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    if (trades.length === 0) return NextResponse.json({ ok: true });
    if (trades.length > MAX_TRADES) {
      return NextResponse.json({ ok: false, error: "Too many trades" }, { status: 413 });
    }

    const rows = trades
      .map(sanitizeTrade)
      .filter(Boolean)
      .map((t: any) => ({
        // Namespace the row id with the user id so one user can NEVER
        // overwrite another user's row by guessing their trade id.
        id: `${user.id}:${t.id}`,
        user_id: user.id,
        data: t,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) return NextResponse.json({ ok: true });

    const { error } = await supabase
      .from("cloud_trades")
      .upsert(rows, { onConflict: "id" });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Sync failed" }, { status: 500 });
  }
}

// DELETE — only your own rows
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { id } = await req.json();
    if (typeof id !== "string") return NextResponse.json({ ok: false }, { status: 400 });

    await supabase
      .from("cloud_trades")
      .delete()
      .eq("id", `${user.id}:${id}`)
      .eq("user_id", user.id);   // belt and braces

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
