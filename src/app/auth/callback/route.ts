import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ipRateLimit } from "@/lib/api-guard";

// OAuth redirect target (Google, etc.) — Supabase sends the browser here with
// a `code` param after the provider round-trip; exchanging it for a session
// is what actually sets the auth cookies, unlike the read-only server clients
// used everywhere else in this app.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (!ipRateLimit(req, 20, 60_000)) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) => {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(origin);
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
