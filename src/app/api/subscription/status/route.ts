import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ status: "none" });

    const { data } = await supabase
      .from("subscriptions")
      .select("status,plan,current_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) return NextResponse.json({ status: "none" });
    return NextResponse.json({
      status: data.status,
      plan: data.plan,
      periodEnd: data.current_period_end,
    });
  } catch {
    return NextResponse.json({ status: "none" });
  }
}
