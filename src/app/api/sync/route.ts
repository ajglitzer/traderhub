import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// GET — fetch all trades for user
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ trades: [] });

    const { data, error } = await supabase
      .from("cloud_trades")
      .select("data")
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ trades: [] });
    const trades = (data || []).map((r: any) => r.data);
    return NextResponse.json({ trades });
  } catch {
    return NextResponse.json({ trades: [] });
  }
}

// POST — upsert all trades for user
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const { trades } = await req.json();
    if (!Array.isArray(trades) || trades.length === 0)
      return NextResponse.json({ ok: true });

    const rows = trades.map((t: any) => ({
      id: t.id,
      user_id: user.id,
      data: t,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("cloud_trades")
      .upsert(rows, { onConflict: "id" });

    if (error) return NextResponse.json({ ok: false, error: error.message });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// DELETE — delete a single trade
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const { id } = await req.json();
    await supabase.from("cloud_trades").delete().eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
