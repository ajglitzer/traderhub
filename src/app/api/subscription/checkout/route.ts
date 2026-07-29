import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ipRateLimit, rateLimit, readJsonBody } from "@/lib/api-guard";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

const ALLOWED_ORIGINS = ["https://traderhub-nine.vercel.app", "http://localhost:3000"];
function safeOrigin(req: NextRequest): string {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export async function POST(req: NextRequest) {
  try {
    if (!ipRateLimit(req, 15, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!rateLimit(`checkout:${user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await readJsonBody<{ plan?: unknown }>(req, 1_000);
    if (!body.ok) return body.response;
    const { plan } = body.data; // "monthly" | "annual"
    if (plan !== "monthly" && plan !== "annual")
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    const priceId = plan === "annual"
      ? process.env.STRIPE_ANNUAL_PRICE_ID!
      : process.env.STRIPE_MONTHLY_PRICE_ID!;

    // Get or create Stripe customer
    let customerId: string | undefined;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const origin = safeOrigin(req);
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?subscribed=1`,
      cancel_url: `${origin}/?canceled=1`,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      metadata: { supabase_user_id: user.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
