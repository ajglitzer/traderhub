import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

// ── IP-based rate limiting ────────────────────────────────────────────────────
// For pre-auth / unauthenticated checks, keyed separately from per-user limits
// (prefixed "ip:") so the two Maps' keyspaces can never collide.
export function getClientIp(req: NextRequest | Request): string {
  const h = req.headers;
  // Vercel sets x-forwarded-for; take the first (client) hop only — later hops
  // are proxy-appended and not attacker-controlled, but the first one is
  // exactly as trustworthy as the platform delivering it to us.
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export function ipRateLimit(req: NextRequest | Request, max = 30, windowMs = 60_000): boolean {
  return rateLimit(`ip:${getClientIp(req)}`, max, windowMs);
}

// Strict tier for auth-adjacent / account-security actions (e.g. account
// deletion) — 5 attempts per 15 minutes, matching the standard brute-force
// throttle used for login endpoints elsewhere. Note: Supabase Auth itself
// (signInWithPassword / signUp / resetPasswordForEmail) is called directly
// from the browser to Supabase's own API and never passes through this
// server, so it can't be throttled here — that needs to be configured in the
// Supabase Dashboard under Authentication → Rate Limits.
export const AUTH_RATE_LIMIT_MAX = 5;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// ── Safe JSON body parsing ──────────────────────────────────────────────────
// Rejects oversized or malformed request bodies before they're parsed/used.
// Checks Content-Length as a fast path, then re-checks the actual decoded
// byte length (Content-Length can be absent or wrong) before calling JSON.parse.
export async function readJsonBody<T = unknown>(
  req: NextRequest | Request,
  maxBytes = 100_000
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Failed to read request body" }, { status: 400 }) };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
  }
  if (!text.trim()) {
    return { ok: false, response: NextResponse.json({ error: "Empty request body" }, { status: 400 }) };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Malformed JSON" }, { status: 400 }) };
  }
}

/**
 * Per-user daily AI rate limit (default 20/day).
 * Uses the ai_usage table in Supabase; requires service role.
 *
 * Read-only — does NOT increment. Call incrementAiUsage() separately, and
 * only once a provider call actually succeeds, so a Groq/Anthropic outage
 * or missing API key doesn't silently burn a user's daily quota.
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

    return { ok: true, remaining: limit - count };
  } catch {
    // Fail open — a rate-limit outage shouldn't break AI for paying users
    return { ok: true, remaining: -1 };
  }
}

/** Call only after a provider call has actually succeeded. */
export async function incrementAiUsage(userId: string): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await admin
      .from("ai_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("day", today)
      .single();

    await admin.from("ai_usage").upsert(
      { user_id: userId, day: today, count: (data?.count ?? 0) + 1 },
      { onConflict: "user_id,day" }
    );
  } catch {
    // Non-fatal — worst case a use goes uncounted, which is the safe direction to fail in
  }
}
