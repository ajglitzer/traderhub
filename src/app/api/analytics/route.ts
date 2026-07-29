import { NextRequest, NextResponse } from "next/server";
import { ipRateLimit } from "@/lib/api-guard";

// Analytics are computed client-side from the store for speed
// This route is a passthrough for server-computed data when DB is available
export async function GET(req: NextRequest) {
  if (!ipRateLimit(req, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return NextResponse.json({ message: "Use client-side analytics from store" });
}
