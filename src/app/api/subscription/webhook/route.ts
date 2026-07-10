import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });

// Use service role key for webhook — can write to any row
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const upsertSub = async (sub: Stripe.Subscription) => {
    const userId = sub.metadata?.supabase_user_id;
    if (!userId) return;
    const item = sub.items.data[0];
    const interval = item?.plan?.interval;
    const plan = interval === "year" ? "annual" : "monthly";

    await supabase.from("subscriptions").upsert({
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan,
      current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });
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
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        // Attach user metadata if missing
        if (!sub.metadata?.supabase_user_id && session.metadata?.supabase_user_id) {
          await stripe.subscriptions.update(sub.id, {
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
}

export const config = { api: { bodyParser: false } };
