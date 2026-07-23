import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Sentinel row ids stored alongside per-trade rows in the same table,
// without a schema migration.
const ACCOUNTS_META_ID = "__account_meta__";
// Records when the user last hit "Clear ALL trades". Any trade upload whose
// own timestamp predates this is rejected server-side — otherwise a device
// with stale cached trades (which never saw the clear) can resurrect old
// data right after an intentional wipe, which is exactly what happened once.
const CLEARED_AT_ID = "__cleared_at__";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// GET — fetch all trades (tagged with accountId) + account metadata + last-clear marker
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ trades: [], accounts: null, clearedAt: null });

    const { data, error } = await supabase
      .from("cloud_trades")
      .select("id,data")
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ trades: [], accounts: null, clearedAt: null });

    const rows = data || [];
    const metaRow = rows.find((r: any) => r.id === ACCOUNTS_META_ID);
    const clearedRow = rows.find((r: any) => r.id === CLEARED_AT_ID);
    const trades = rows
      .filter((r: any) => r.id !== ACCOUNTS_META_ID && r.id !== CLEARED_AT_ID)
      .map((r: any) => r.data);
    return NextResponse.json({
      trades,
      accounts: metaRow?.data?.accounts ?? null,
      clearedAt: clearedRow?.data?.clearedAt ?? null,
    });
  } catch {
    return NextResponse.json({ trades: [], accounts: null, clearedAt: null });
  }
}

// POST — upsert trades (each tagged with accountId) and/or account metadata.
// `clearAll: true` wipes every trade for this user and records a clearedAt
// marker instead (used by "Clear ALL trades").
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const body = await req.json();

    if (body.clearAll) {
      const clearedAt = new Date().toISOString();
      const { error } = await supabase
        .from("cloud_trades")
        .delete()
        .eq("user_id", user.id)
        .not("id", "in", `(${ACCOUNTS_META_ID},${CLEARED_AT_ID})`);
      if (error) return NextResponse.json({ ok: false, error: error.message });

      const { error: markError } = await supabase.from("cloud_trades").upsert(
        { id: CLEARED_AT_ID, user_id: user.id, data: { clearedAt }, updated_at: clearedAt },
        { onConflict: "id" }
      );
      if (markError) return NextResponse.json({ ok: false, error: markError.message });
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
      // Reject any trade older than the last clear — prevents a device with
      // stale pre-clear data from silently undoing an intentional wipe.
      const { data: markRow } = await supabase
        .from("cloud_trades").select("data").eq("user_id", user.id).eq("id", CLEARED_AT_ID).maybeSingle();
      const clearedAtMs = markRow?.data?.clearedAt ? new Date(markRow.data.clearedAt).getTime() : 0;
      const fresh = clearedAtMs
        ? trades.filter((t: any) => new Date(t.updatedAt || t.createdAt || 0).getTime() >= clearedAtMs)
        : trades;

      if (fresh.length) {
        const rows = fresh.map((t: any) => ({
          id: t.id,
          user_id: user.id,
          data: t,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("cloud_trades").upsert(rows, { onConflict: "id" });
        if (error) return NextResponse.json({ ok: false, error: error.message });
      }
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
        .filter((r: any) => r.id !== ACCOUNTS_META_ID && r.id !== CLEARED_AT_ID && r.data?.accountId === accountId)
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
