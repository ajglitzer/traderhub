import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Use service role to delete user data and the auth account
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete user data from all tables
    await Promise.all([
      admin.from("subscriptions").delete().eq("user_id", user.id),
      admin.from("cloud_trades").delete().eq("user_id", user.id),
      admin.from("profiles").delete().eq("id", user.id),
      admin.from("messages").delete().or(`from_id.eq.${user.id},to_id.eq.${user.id}`),
      admin.from("friend_requests").delete().or(`from_id.eq.${user.id},to_id.eq.${user.id}`),
      admin.from("blocks").delete().or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ]);

    // Delete the auth account itself
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Delete account error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
