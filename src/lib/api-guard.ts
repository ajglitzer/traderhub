import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Pro check. The UI gate is cosmetic — without this, anyone can
 * curl /api/analyze and burn the Groq quota for free.
 */
export async function requirePro(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, status: 401, error: "Sign in required" };

    const { data } = await supabase
      .from("subscriptions")
      .select("status,current_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const now = Date.now();
    const periodEnd = data?.current_period_end ? new Date(data.current_period_end).getTime() : 0;
    // Keep Pro active if: active, trialing, OR cancelled but billing period not yet over
    const isPro =
      data?.status === "active" ||
      data?.status === "trialing" ||
      (data?.status === "canceled" && periodEnd > now);
    if (!isPro) return { ok: false, status: 402, error: "TraderHub Pro required" };

    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 401, error: "Auth check failed" };
  }
}

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
// Prevents a single user from draining the Groq quota with rapid requests.
const hits = new Map<string, number[]>();

export function rateLimit(userId: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const times = (hits.get(userId) || []).filter(t => now - t < windowMs);
  if (times.length >= max) return false;
  times.push(now);
  hits.set(userId, times);

  // Prevent unbounded growth
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every(t => now - t > windowMs)) hits.delete(k);
    }
  }
  return true;
}

/**
 * Per-user daily AI rate limit (default 20/day).
 * Uses the ai_usage table in Supabase; requires service role.
 */
export async function checkAiLimit(userId: string, limit = 20): Promise<
  { ok: true; remaining: number } | { ok: false; status: number; error: string }
> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { data } = await admin
      .from("ai_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("day", today)
      .single();

    const count = data?.count ?? 0;
    if (count >= limit) {
      return { ok: false, status: 429, error: `Daily AI limit reached (${limit}/day). Resets at midnight UTC.` };
    }

    await admin.from("ai_usage").upsert(
      { user_id: userId, day: today, count: count + 1 },
      { onConflict: "user_id,day" }
    );

    return { ok: true, remaining: limit - count - 1 };
  } catch {
    // Fail open — a rate-limit outage shouldn't break AI for paying users
    return { ok: true, remaining: -1 };
  }
}
