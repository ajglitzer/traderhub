import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Sentinel row id used to store account metadata (name/balance/color/etc.)
// alongside per-trade rows in the same table, without a schema migration.
const ACCOUNTS_META_ID = "__account_meta__";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// GET — fetch all trades (tagged with accountId) + account metadata for user
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ trades: [], accounts: null });

    const { data, error } = await supabase
      .from("cloud_trades")
      .select("id,data")
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ trades: [], accounts: null });

    const rows = data || [];
    const metaRow = rows.find((r: any) => r.id === ACCOUNTS_META_ID);
    const trades = rows.filter((r: any) => r.id !== ACCOUNTS_META_ID).map((r: any) => r.data);
    return NextResponse.json({ trades, accounts: metaRow?.data?.accounts ?? null });
  } catch {
    return NextResponse.json({ trades: [], accounts: null });
  }
}

// POST — upsert trades (each tagged with accountId) and/or account metadata.
// `clearAll: true` wipes every row for this user instead (used by "Clear ALL trades").
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const body = await req.json();

    if (body.clearAll) {
      const { error } = await supabase.from("cloud_trades").delete().eq("user_id", user.id);
      if (error) return NextResponse.json({ ok: false, error: error.message });
      return NextResponse.json({ ok: true });
    }

    const { trades, accounts } = body;

    if (Array.isArray(accounts)) {
      const { error } = await supabase.from("cloud_trades").upsert(
        { id: ACCOUNTS_META_ID, user_id: user.id, data: { accounts }, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      if (error) return NextResponse.json({ ok: false, error: error.message });
    }

    if (Array.isArray(trades) && trades.length > 0) {
      const rows = trades.map((t: any) => ({
        id: t.id,
        user_id: user.id,
        data: t,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("cloud_trades").upsert(rows, { onConflict: "id" });
      if (error) return NextResponse.json({ ok: false, error: error.message });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// DELETE — remove a single trade by id, or every trade for an account by accountId
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const { id, accountId } = await req.json();

    if (accountId) {
      const { data } = await supabase.from("cloud_trades").select("id,data").eq("user_id", user.id);
      const ids = (data || [])
        .filter((r: any) => r.id !== ACCOUNTS_META_ID && r.data?.accountId === accountId)
        .map((r: any) => r.id);
      if (ids.length) await supabase.from("cloud_trades").delete().eq("user_id", user.id).in("id", ids);
      return NextResponse.json({ ok: true });
    }

    if (id) await supabase.from("cloud_trades").delete().eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
