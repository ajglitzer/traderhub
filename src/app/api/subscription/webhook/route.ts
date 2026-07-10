import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const upsertSub = async (sub: Stripe.Subscription) => {
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) return;
      const item = sub.items.data[0];
      const interval = item?.plan?.interval;
      const plan = interval === "year" ? "annual" : "monthly";
      const periodEnd = (sub as any).current_period_end;

      const { error } = await supabase.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_subscription_id" });

      if (error) console.error("Supabase upsert error:", error);
    };

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSub(event.data.object as Stripe.Subscription);
        break;
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const stripe2 = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
          const sub = await stripe2.subscriptions.retrieve(session.subscription as string);
          if (!sub.metadata?.supabase_user_id && session.metadata?.supabase_user_id) {
            await stripe2.subscriptions.update(sub.id, {
              metadata: { supabase_user_id: session.metadata.supabase_user_id },
            });
            (sub.metadata as any).supabase_user_id = session.metadata.supabase_user_id;
          }
          await upsertSub(sub);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
